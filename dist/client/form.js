import { isElementInViewport, scrollToAndCenter } from './elements.js';
import { onDestroy, tick } from 'svelte';
import { afterNavigate, beforeNavigate } from '$app/navigation';
var FetchStatus;
(function (FetchStatus) {
    FetchStatus[FetchStatus["Idle"] = 0] = "Idle";
    FetchStatus[FetchStatus["Submitting"] = 1] = "Submitting";
    FetchStatus[FetchStatus["Delayed"] = 2] = "Delayed";
    FetchStatus[FetchStatus["Timeout"] = 3] = "Timeout";
})(FetchStatus || (FetchStatus = {}));
const activeTimers = new Set();
let _initialized = false;
/**
 * @DCI-context
 */
export function Form(formEl, timers, options) {
    let state = FetchStatus.Idle;
    let delayedTimeout, timeoutTimeout;
    let aboutToNavigate = false;
    //#region Timers
    const Timers = activeTimers;
    // https://www.nngroup.com/articles/response-times-3-important-limits/
    function Timers_start() {
        Timers_clear();
        Timers_setState(state != FetchStatus.Delayed
            ? FetchStatus.Submitting
            : FetchStatus.Delayed);
        delayedTimeout = window.setTimeout(() => {
            if (delayedTimeout && state == FetchStatus.Submitting)
                Timers_setState(FetchStatus.Delayed);
        }, options.delayMs);
        timeoutTimeout = window.setTimeout(() => {
            if (timeoutTimeout && state == FetchStatus.Delayed)
                Timers_setState(FetchStatus.Timeout);
        }, options.timeoutMs);
        Timers.add(Timers_clear);
    }
    /**
     * Clear timers and set state to Idle.
     */
    function Timers_clear() {
        clearTimeout(delayedTimeout);
        clearTimeout(timeoutTimeout);
        delayedTimeout = timeoutTimeout = 0;
        Timers.delete(Timers_clear);
        Timers_setState(FetchStatus.Idle);
    }
    function Timers_clearAll() {
        Timers.forEach((t) => t());
        Timers.clear();
    }
    function Timers_setState(s) {
        state = s;
        timers.submitting.set(state >= FetchStatus.Submitting);
        timers.delayed.set(state >= FetchStatus.Delayed);
        timers.timeout.set(state >= FetchStatus.Timeout);
    }
    //#endregion
    //#region ErrorTextEvents
    const ErrorTextEvents = formEl;
    function ErrorTextEvents__selectText(e) {
        const target = e.target;
        if (options.selectErrorText)
            target.select();
    }
    function ErrorTextEvents_addErrorTextListeners() {
        if (!options.selectErrorText)
            return;
        ErrorTextEvents.querySelectorAll('input').forEach((el) => {
            el.addEventListener('invalid', ErrorTextEvents__selectText);
        });
    }
    function ErrorTextEvents_removeErrorTextListeners() {
        if (!options.selectErrorText)
            return;
        ErrorTextEvents.querySelectorAll('input').forEach((el) => el.removeEventListener('invalid', ErrorTextEvents__selectText));
    }
    //#endregion
    //#region Form
    const Form = formEl;
    function Form_shouldAutoFocus(userAgent) {
        if (typeof options.autoFocusOnError === 'boolean')
            return options.autoFocusOnError;
        else
            return !/iPhone|iPad|iPod|Android/i.test(userAgent);
    }
    const Form_scrollToFirstError = async () => {
        if (options.scrollToError == 'off')
            return;
        const selector = options.errorSelector;
        if (!selector)
            return;
        // Wait for form to update with errors
        await tick();
        // Scroll to first form message, if not visible
        let el;
        el = Form.querySelector(selector);
        if (!el)
            return;
        // Find underlying element if it is a FormGroup element
        el = el.querySelector(selector) ?? el;
        const nav = options.stickyNavbar
            ? document.querySelector(options.stickyNavbar)
            : null;
        if (typeof options.scrollToError != 'string') {
            el.scrollIntoView(options.scrollToError);
        }
        else if (!isElementInViewport(el, nav?.offsetHeight ?? 0)) {
            scrollToAndCenter(el, undefined, options.scrollToError);
        }
        // Don't focus on the element if on mobile, it will open the keyboard
        // and probably hide the error message.
        if (!Form_shouldAutoFocus(navigator.userAgent))
            return;
        let focusEl;
        focusEl = el;
        if (!['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(focusEl.tagName)) {
            focusEl = focusEl.querySelector('input:not([type="hidden"]):not(.flatpickr-input), select, textarea');
        }
        if (focusEl) {
            try {
                focusEl.focus({ preventScroll: true });
                if (options.selectErrorText && focusEl.tagName == 'INPUT') {
                    focusEl.select();
                }
            }
            catch (err) {
                // Some hidden inputs like from flatpickr cannot be focused.
            }
        }
    };
    //#endregion
    {
        ErrorTextEvents_addErrorTextListeners();
        const completed = (cancelled, clearIfNotNavigating = false) => {
            Timers_clear();
            if (!cancelled)
                setTimeout(Form_scrollToFirstError);
            // clearifNotNavigating is set when redirecting, to see if the navigation events
            // have been triggered. In rare cases they aren't, in which case we need to clear
            //  the timers here, instead of in afterNavigate.
            if (clearIfNotNavigating && !aboutToNavigate) {
                Timers_clearAll();
            }
        };
        onDestroy(() => {
            ErrorTextEvents_removeErrorTextListeners();
            completed(true);
        });
        // If redirected, clear timers after navigating for better UX.
        if (!_initialized) {
            beforeNavigate(() => {
                aboutToNavigate = true;
            });
            afterNavigate((nav) => {
                if (nav.type == 'enter')
                    return;
                aboutToNavigate = false;
                Timers_clearAll();
            });
            _initialized = true;
        }
        return {
            submitting: () => {
                aboutToNavigate = false;
                Timers_start();
            },
            completed,
            scrollToFirstError: () => {
                setTimeout(Form_scrollToFirstError);
            },
            isSubmitting: () => state === FetchStatus.Submitting || state === FetchStatus.Delayed
        };
    }
}
