import { z } from 'zod';
import type { RequestHandler } from './$types';
import { superValidate } from '$lib/superValidate';

const usernameCheck = z
  .object({
    username: z
      .string()
      .min(2)
      .refine(async (username) => {
        await new Promise((r) => setTimeout(r, 500));
        return username.toLowerCase() != 'taken';
      }, 'This username is taken.')
  })
  .transform((data) => data);

export const POST: RequestHandler = async ({ request }) => {
  //await new Promise(r => setTimeout(r, 500))
  const form = await superValidate(request, usernameCheck);
  console.log(
    '🚀 ~ file: +server.ts:20 ~ constPOST:RequestHandler= ~ form:',
    form
  );
  return new Response(null, { status: form.valid ? 200 : 400 });
};
