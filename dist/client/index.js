import { beforeNavigate } from '$app/navigation';
import { page } from '$app/stores';
import { derived, get, writable } from 'svelte/store';
import { onDestroy, tick } from 'svelte';
import { browser } from '$app/environment';
import { SuperFormError } from '../index.js';
import { comparePaths, setPaths, pathExists, isInvalidPath } from '../traversal.js';
import { fieldProxy } from './proxies.js';
import { clone } from '../utils.js';
import { splitPath } from '../stringPath.js';
import { validateField, validateObjectErrors } from './clientValidation.js';
import { formEnhance, shouldSyncFlash } from './formEnhance.js';
import { clearErrors, flattenErrors } from '../errors.js';
import { clientValidation, validateForm } from './clientValidation.js';
export { intProxy, numberProxy, booleanProxy, dateProxy, fieldProxy, formFieldProxy, stringProxy, arrayProxy } from './proxies.js';
export { superValidate, superValidateSync, actionResult, message, setMessage, setError, defaultValues } from '../superValidate.js';
export const defaultOnError = (event) => {
    console.warn('Unhandled Superform error, use onError event to handle it:', event.result.error);
};
const defaultFormOptions = {
    applyAction: true,
    invalidateAll: true,
    resetForm: false,
    autoFocusOnError: 'detect',
    scrollToError: 'smooth',
    errorSelector: '[aria-invalid="true"],[data-invalid]',
    selectErrorText: false,
    stickyNavbar: undefined,
    taintedMessage: 'Do you want to leave this page? Changes you made may not be saved.',
    onSubmit: undefined,
    onResult: undefined,
    onUpdate: undefined,
    onUpdated: undefined,
    onError: defaultOnError,
    dataType: 'form',
    validators: undefined,
    defaultValidator: 'keep',
    customValidity: false,
    clearOnSubmit: 'errors-and-message',
    delayMs: 500,
    timeoutMs: 8000,
    multipleSubmits: 'prevent',
    validation: undefined,
    SPA: undefined,
    validateMethod: 'auto'
};
const formIds = new WeakMap();
const initializedForms = new WeakMap();
function multipleFormIdError(id) {
    return (`Duplicate form id's found: "${id}". ` +
        'Multiple forms will receive the same data. Use the id option to differentiate between them, ' +
        'or if this is intended, set the warnings.duplicateId option to false in superForm to disable this warning. ' +
        'More information: https://superforms.rocks/concepts/multiple-forms');
}
/**
 * Initializes a SvelteKit form, for convenient handling of values, errors and sumbitting data.
 * @param {SuperValidated} form Usually data.form from PageData.
 * @param {FormOptions} options Configuration for the form.
 * @returns {SuperForm} An object with properties for the form.
 * @DCI-context
 */
export function superForm(form, options = {}) {
    // Option guards
    {
        options = {
            ...defaultFormOptions,
            ...options
        };
        if (options.SPA && options.validators === undefined) {
            console.warn('No validators set for superForm in SPA mode. ' +
                'Add them to the validators option, or set it to false to disable this warning.');
        }
    }
    let _formId = options.id;
    // Normalize form argument to SuperValidated<T, M>
    if (!form || Context_isValidationObject(form) === false) {
        if (options.warnings?.noValidationAndConstraints !== false) {
            console.warn((form
                ? 'Form data sent directly to superForm instead of through superValidate. No initial data validation is made. '
                : 'No form data sent to superForm, schema type safety cannot be guaranteed. ') +
                'Also, no constraints will exist for the form. ' +
                'Set the warnings.noValidationAndConstraints option to false to disable this warning.');
        }
        form = {
            valid: false,
            posted: false,
            errors: {},
            data: form ?? {},
            constraints: {}
        };
    }
    else {
        if (_formId === undefined)
            _formId = form.id;
    }
    const _initialFormId = _formId;
    const _currentPage = get(page);
    // Check multiple id's
    if (options.warnings?.duplicateId !== false) {
        if (!formIds.has(_currentPage)) {
            formIds.set(_currentPage, new Set([_initialFormId]));
        }
        else {
            const currentForms = formIds.get(_currentPage);
            if (currentForms?.has(_initialFormId)) {
                console.warn(multipleFormIdError(_initialFormId));
            }
            else {
                currentForms?.add(_initialFormId);
            }
        }
    }
    // Need to clone the form data, in case it's used to populate multiple forms and in components
    // that are mounted and destroyed multiple times.
    if (!initializedForms.has(form)) {
        initializedForms.set(form, clone(form));
    }
    const initialForm = initializedForms.get(form);
    if (typeof initialForm.valid !== 'boolean') {
        throw new SuperFormError('A non-validation object was passed to superForm. ' +
            'It should be an object of type SuperValidated, usually returned from superValidate.');
    }
    // Detect if a form is posted without JavaScript.
    const postedData = _currentPage.form;
    if (!browser && postedData && typeof postedData === 'object') {
        for (const postedForm of Context_findValidationForms(postedData).reverse()) {
            if (postedForm.id === _formId && !initializedForms.has(postedForm)) {
                // Prevent multiple "posting" that can happen when components are recreated.
                initializedForms.set(postedData, postedData);
                const pageDataForm = form;
                form = postedForm;
                // Reset the form if option set and form is valid.
                if (form.valid &&
                    options.resetForm &&
                    (options.resetForm === true || options.resetForm())) {
                    form = clone(pageDataForm);
                    form.message = clone(postedForm.message);
                }
                break;
            }
        }
    }
    else {
        form = clone(initialForm);
    }
    const form2 = form;
    // Underlying store for Errors
    const _errors = writable(form2.errors);
    ///// Roles ///////////////////////////////////////////////////////
    const FormId = writable(_formId);
    const Context = {
        taintedMessage: options.taintedMessage,
        taintedFormState: clone(initialForm.data)
    };
    function Context_randomId(length = 8) {
        return Math.random()
            .toString(36)
            .substring(2, length + 2);
    }
    function Context_setTaintedFormState(data) {
        Context.taintedFormState = clone(data);
    }
    function Context_findValidationForms(data) {
        const forms = Object.values(data).filter((v) => Context_isValidationObject(v) !== false);
        return forms;
    }
    /**
     * Return false if object isn't a validation object, otherwise the form id,
     * which may be undefined, so a falsy check isn't enough.
     */
    function Context_isValidationObject(object) {
        if (!object || typeof object !== 'object')
            return false;
        if (!('valid' in object &&
            'errors' in object &&
            typeof object.valid === 'boolean')) {
            return false;
        }
        return 'id' in object && typeof object.id === 'string'
            ? object.id
            : undefined;
    }
    function Context_useEnhanceEnabled() {
        options.taintedMessage = Context.taintedMessage;
        if (_formId === undefined)
            FormId.set(Context_randomId());
    }
    function Context_newFormStore(data) {
        const _formData = writable(data);
        return {
            subscribe: _formData.subscribe,
            set: (value, options = {}) => {
                Tainted_update(value, Context.taintedFormState, options.taint ?? true);
                Context_setTaintedFormState(value);
                // Need to clone the value, so it won't refer to $page for example.
                return _formData.set(clone(value));
            },
            update: (updater, options = {}) => {
                return _formData.update((value) => {
                    const output = updater(value);
                    Tainted_update(output, Context.taintedFormState, options.taint ?? true);
                    Context_setTaintedFormState(output);
                    // No cloning here, since it's an update
                    return output;
                });
            }
        };
    }
    const Unsubscriptions = [
        FormId.subscribe((id) => (_formId = id))
    ];
    function Unsubscriptions_add(func) {
        Unsubscriptions.push(func);
    }
    function Unsubscriptions_unsubscribe() {
        Unsubscriptions.forEach((unsub) => unsub());
    }
    // Stores for the properties of SuperValidated<T, M>
    const Form = Context_newFormStore(form2.data);
    // Check for nested objects, throw if datatype isn't json
    function Form_checkForNestedData(key, value) {
        if (!value || typeof value !== 'object')
            return;
        if (Array.isArray(value)) {
            if (value.length > 0)
                Form_checkForNestedData(key, value[0]);
        }
        else if (!(value instanceof Date)) {
            throw new SuperFormError(`Object found in form field "${key}". ` +
                `Set the dataType option to "json" and add use:enhance to use nested data structures. ` +
                `More information: https://superforms.rocks/concepts/nested-data`);
        }
    }
    async function Form_updateFromValidation(form, untaint) {
        if (form.valid &&
            untaint &&
            options.resetForm &&
            (options.resetForm === true || options.resetForm())) {
            Form_reset(form.message);
        }
        else {
            rebind(form, untaint);
        }
        // onUpdated may check stores, so need to wait for them to update.
        if (formEvents.onUpdated.length) {
            await tick();
        }
        // But do not await on onUpdated itself, since we're already finished with the request
        for (const event of formEvents.onUpdated) {
            event({ form });
        }
    }
    function Form_reset(message, data, id) {
        const resetData = clone(initialForm);
        resetData.data = { ...resetData.data, ...data };
        if (id !== undefined)
            resetData.id = id;
        rebind(resetData, true, message);
    }
    const Form_updateFromActionResult = async (result, untaint) => {
        if (result.type == 'error') {
            throw new SuperFormError(`ActionResult of type "${result.type}" cannot be passed to update function.`);
        }
        if (result.type == 'redirect') {
            // All we need to do if redirected is to reset the form.
            // No events should be triggered because technically we're somewhere else.
            if (options.resetForm &&
                (options.resetForm === true || options.resetForm())) {
                Form_reset();
            }
            return;
        }
        if (typeof result.data !== 'object') {
            throw new SuperFormError('Non-object validation data returned from ActionResult.');
        }
        const forms = Context_findValidationForms(result.data);
        if (!forms.length) {
            throw new SuperFormError('No form data returned from ActionResult. Make sure you return { form } in the form actions.');
        }
        for (const newForm of forms) {
            if (newForm.id !== _formId)
                continue;
            await Form_updateFromValidation(newForm, untaint ?? (result.status >= 200 && result.status < 300));
        }
    };
    const LastChanges = writable([]);
    const Message = writable(form2.message);
    const Constraints = writable(form2.constraints);
    const Posted = writable(false);
    // eslint-disable-next-line dci-lint/grouped-rolemethods
    const Errors = {
        subscribe: _errors.subscribe,
        set: _errors.set,
        update: _errors.update,
        /**
         * To work with client-side validation, errors cannot be deleted but must
         * be set to undefined, to know where they existed before (tainted+error check in oninput)
         */
        clear: () => clearErrors(_errors, {
            undefinePath: null,
            clearFormLevelErrors: true
        })
    };
    const Tainted = writable();
    function Tainted_data() {
        return get(Tainted);
    }
    function Tainted_isTainted(obj) {
        if (obj === null)
            throw new SuperFormError('$tainted store contained null');
        if (typeof obj === 'object') {
            for (const obj2 of Object.values(obj)) {
                if (Tainted_isTainted(obj2))
                    return true;
            }
        }
        return obj === true;
    }
    async function Tainted__validate(path, taint) {
        let shouldValidate = options.validationMethod === 'oninput';
        if (!shouldValidate) {
            const errorContent = get(Errors);
            const errorNode = errorContent
                ? pathExists(errorContent, path, {
                    modifier: (pathData) => {
                        // Check if we have found a string in an error array.
                        if (isInvalidPath(path, pathData)) {
                            throw new SuperFormError('Errors can only be added to form fields, not to arrays or objects in the schema. Path: ' +
                                pathData.path.slice(0, -1));
                        }
                        return pathData.value;
                    }
                })
                : undefined;
            // Need a special check here, since if the error has never existed,
            // there won't be a key for the error. But if it existed and was cleared,
            // the key exists with the value undefined.
            const hasError = errorNode && errorNode.key in errorNode.parent;
            shouldValidate = !!hasError;
        }
        if (shouldValidate) {
            await validateField(path, options, Form, Errors, Tainted, { taint });
            return true;
        }
        else {
            return false;
        }
    }
    async function Tainted_update(newObj, compareAgainst, taintOptions) {
        // Ignore is set when returning errors from the server
        // so status messages and form-level errors won't be
        // immediately cleared by client-side validation.
        if (taintOptions == 'ignore')
            return;
        let paths = comparePaths(newObj, compareAgainst);
        if (typeof taintOptions === 'object') {
            if (typeof taintOptions.fields === 'string')
                taintOptions.fields = [taintOptions.fields];
            paths = taintOptions.fields.map((path) => splitPath(path));
            taintOptions = true;
        }
        LastChanges.set(paths);
        if (paths.length) {
            if (taintOptions === 'untaint-all') {
                Tainted.set(undefined);
            }
            else {
                Tainted.update((tainted) => {
                    if (taintOptions !== true && tainted) {
                        // Check if the paths are tainted already, then set to undefined or skip entirely.
                        const _tainted = tainted;
                        paths = paths.filter((path) => pathExists(_tainted, path));
                        if (paths.length) {
                            if (!tainted)
                                tainted = {};
                            setPaths(tainted, paths, undefined);
                        }
                    }
                    else if (taintOptions === true) {
                        if (!tainted)
                            tainted = {};
                        setPaths(tainted, paths, true);
                    }
                    return tainted;
                });
            }
            if (!(options.validationMethod == 'onblur' ||
                options.validationMethod == 'submit-only')) {
                let updated = false;
                for (const path of paths) {
                    updated = updated || (await Tainted__validate(path, taintOptions));
                }
                if (!updated) {
                    await validateObjectErrors(options, Form, Errors, get(Tainted));
                }
            }
        }
    }
    function Tainted_set(tainted, newData) {
        Tainted.set(tainted);
        Context_setTaintedFormState(newData);
    }
    // Timers
    const Submitting = writable(false);
    const Delayed = writable(false);
    const Timeout = writable(false);
    // Utilities
    const AllErrors = derived(Errors, ($errors) => {
        if (!$errors)
            return [];
        return flattenErrors($errors);
    });
    //////////////////////////////////////////////////////////////////////
    // Need to clear this and set it after use:enhance has run, to avoid showing the
    // tainted dialog when a form doesn't use it or the browser doesn't use JS.
    options.taintedMessage = undefined;
    onDestroy(() => {
        Unsubscriptions_unsubscribe();
        for (const events of Object.values(formEvents)) {
            events.length = 0;
        }
        formIds.get(_currentPage)?.delete(_initialFormId);
    });
    if (options.dataType !== 'json') {
        for (const [key, value] of Object.entries(form2.data)) {
            Form_checkForNestedData(key, value);
        }
    }
    function rebind(form, untaint, message) {
        if (untaint) {
            Tainted_set(typeof untaint === 'boolean' ? undefined : untaint, form.data);
        }
        message = message ?? form.message;
        // Form data is not tainted when rebinding.
        // Prevents object errors from being revalidated after rebind.
        // eslint-disable-next-line dci-lint/private-role-access
        Form.set(form.data, { taint: 'ignore' });
        Message.set(message);
        Errors.set(form.errors);
        FormId.set(form.id);
        Posted.set(form.posted);
        if (options.flashMessage && shouldSyncFlash(options)) {
            const flash = options.flashMessage.module.getFlash(page);
            if (message && get(flash) === undefined) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                flash.set(message);
            }
        }
    }
    const formEvents = {
        onSubmit: options.onSubmit ? [options.onSubmit] : [],
        onResult: options.onResult ? [options.onResult] : [],
        onUpdate: options.onUpdate ? [options.onUpdate] : [],
        onUpdated: options.onUpdated ? [options.onUpdated] : [],
        onError: options.onError ? [options.onError] : []
    };
    ///// When use:enhance is enabled ///////////////////////////////////////////
    if (browser) {
        beforeNavigate((nav) => {
            if (options.taintedMessage && !get(Submitting)) {
                const taintStatus = Tainted_data();
                if (taintStatus &&
                    Tainted_isTainted(taintStatus) &&
                    !window.confirm(options.taintedMessage)) {
                    nav.cancel();
                }
            }
        });
        // Need to subscribe to catch page invalidation.
        Unsubscriptions_add(page.subscribe(async (pageUpdate) => {
            if (!options.applyAction)
                return;
            // Strange timing issue in SPA mode forces a wait here,
            // otherwise errors will appear even if the form is valid
            // when pressing enter to submit the form (not when clicking a submit button!)
            if (options.SPA) {
                await new Promise((r) => setTimeout(r, 0));
            }
            const untaint = pageUpdate.status >= 200 && pageUpdate.status < 300;
            if (pageUpdate.form && typeof pageUpdate.form === 'object') {
                const actionData = pageUpdate.form;
                // Check if it is an error result, sent here from formEnhance
                if (actionData.type == 'error')
                    return;
                const forms = Context_findValidationForms(actionData);
                for (const newForm of forms) {
                    //console.log('🚀~ ActionData ~ newForm:', newForm.id);
                    if (newForm.id !== _formId || initializedForms.has(newForm)) {
                        continue;
                    }
                    // Prevent multiple "posting" that can happen when components are recreated.
                    initializedForms.set(newForm, newForm);
                    await Form_updateFromValidation(newForm, untaint);
                }
            }
            else if (pageUpdate.data && typeof pageUpdate.data === 'object') {
                // It's a page reload, redirect or error/failure,
                // so don't trigger any events, just update the data.
                const forms = Context_findValidationForms(pageUpdate.data);
                for (const newForm of forms) {
                    //console.log('🚀 ~ PageData ~ newForm:', newForm.id);
                    if (newForm.id !== _formId || initializedForms.has(newForm)) {
                        continue;
                    }
                    rebind(newForm, untaint);
                }
            }
        }));
    }
    const Fields = Object.fromEntries(Object.keys(initialForm.data).map((key) => {
        return [
            key,
            {
                name: key,
                value: fieldProxy(Form, key),
                errors: fieldProxy(Errors, key),
                constraints: fieldProxy(Constraints, key)
            }
        ];
    }));
    async function validate(path, opts) {
        if (path === undefined) {
            return clientValidation(options.validators, get(Form), _formId, get(Constraints), false);
        }
        const result = await validateField(splitPath(path), options, Form, Errors, Tainted, opts);
        return result.errors;
    }
    return {
        form: Form,
        formId: FormId,
        errors: Errors,
        message: Message,
        constraints: Constraints,
        fields: Fields,
        tainted: Tainted,
        submitting: derived(Submitting, ($s) => $s),
        delayed: derived(Delayed, ($d) => $d),
        timeout: derived(Timeout, ($t) => $t),
        options,
        capture: function () {
            return {
                valid: initialForm.valid,
                posted: get(Posted),
                errors: get(Errors),
                data: get(Form),
                constraints: get(Constraints),
                message: get(Message),
                id: _formId,
                tainted: get(Tainted)
            };
        },
        restore: function (snapshot) {
            return rebind(snapshot, snapshot.tainted ?? true);
        },
        validate: validate,
        enhance: (el, events) => {
            if (events) {
                if (events.onError) {
                    if (options.onError === 'apply') {
                        throw new SuperFormError('options.onError is set to "apply", cannot add any onError events.');
                    }
                    else if (events.onError === 'apply') {
                        throw new SuperFormError('Cannot add "apply" as onError event in use:enhance.');
                    }
                    formEvents.onError.push(events.onError);
                }
                if (events.onResult)
                    formEvents.onResult.push(events.onResult);
                if (events.onSubmit)
                    formEvents.onSubmit.push(events.onSubmit);
                if (events.onUpdate)
                    formEvents.onUpdate.push(events.onUpdate);
                if (events.onUpdated)
                    formEvents.onUpdated.push(events.onUpdated);
            }
            return formEnhance(el, Submitting, Delayed, Timeout, Errors, Form_updateFromActionResult, options, Form, Message, Context_useEnhanceEnabled, formEvents, FormId, Constraints, Tainted, LastChanges, Context_findValidationForms, Posted);
        },
        allErrors: AllErrors,
        posted: Posted,
        reset: (options) => Form_reset(options?.keepMessage ? get(Message) : undefined, options?.data, options?.id)
    };
}
