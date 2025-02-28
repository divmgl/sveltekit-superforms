import { superValidate, message } from '$lib/server';
import { fail } from '@sveltejs/kit';
import { schema } from './schema';

import type { Actions, PageServerLoad } from './$types';

///// Load function /////

export const load: PageServerLoad = async () => {
  const form = await superValidate(schema);
  return { form };
};

///// Form actions /////

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, schema);

    console.log('POST', form);

    if (!form.valid) return fail(400, { form });

    form.data.email = 'posted@example.com';

    return message(form, 'Form posted successfully!');
  }
};
