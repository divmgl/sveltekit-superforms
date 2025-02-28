import { describe, expect, test } from 'vitest';
import { get, writable } from 'svelte/store';
import { superValidate } from '$lib/server';
import {
  booleanProxy,
  dateProxy,
  fieldProxy,
  intProxy,
  numberProxy
} from '$lib/client';
import { z } from 'zod';

describe('Value proxies', () => {
  test('booleanProxy', async () => {
    const schema = z.object({
      bool: z.boolean()
    });

    const superForm = await superValidate(schema);
    const form = writable(superForm.data);

    const proxy = booleanProxy(form, 'bool');

    expect(get(form).bool).toStrictEqual(false);

    proxy.set('true');

    expect(get(form).bool).toStrictEqual(true);
  });

  test('intProxy', async () => {
    const schema = z.object({
      int: z.number().int()
    });

    const superForm = await superValidate(schema);
    const form = writable(superForm.data);

    const proxy = intProxy(form, 'int');

    expect(get(form).int).toStrictEqual(0);

    proxy.set('123');

    expect(get(form).int).toStrictEqual(123);
  });

  test('numberProxy', async () => {
    const schema = z.object({
      number: z.number()
    });

    const superForm = await superValidate(schema);
    const form = writable(superForm.data);

    const proxy = numberProxy(form, 'number');

    expect(get(form).number).toStrictEqual(0);

    proxy.set('123.5');

    expect(get(form).number).toStrictEqual(123.5);
  });

  test('dateProxy', async () => {
    const schema = z.object({
      date: z.date()
    });

    const superForm = await superValidate(schema);
    const form = writable(superForm.data);

    const proxy = dateProxy(form, 'date');

    expect(get(form).date).toBeUndefined();

    const d = new Date();

    proxy.set(d.toISOString());

    expect(get(form).date).toEqual(d);
  });
});

describe('Field proxies', () => {
  const schema = z.object({
    test: z.number().array().default([0, 1, 2, 3])
  });

  test('fieldProxy with StringPath', async () => {
    const superForm = await superValidate(schema);
    const form = writable(superForm.data);

    const proxy = fieldProxy(form, 'test[2]');

    expect(get(proxy)).toEqual(2);
    proxy.set(123);
    expect(get(proxy)).toEqual(123);
    expect(get(form).test[2]).toEqual(123);
  });
});
