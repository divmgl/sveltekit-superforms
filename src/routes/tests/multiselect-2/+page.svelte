<script lang="ts">
  import { superForm } from '$lib/client';
  import type { PageData } from './$types';
  import SuperDebug from '$lib/client/SuperDebug.svelte';
  import { schema } from './schema';
  import type { z } from 'zod';

  export let data: PageData;

  type Group = z.infer<typeof schema>['group'] extends (infer U)[]
    ? U
    : never;

  const { form, enhance, message, errors } = superForm(data.form, {
    validators: schema,
    dataType: 'json'
  });

  function toggleGroup(group: Group, add: boolean) {
    form.update(($form) => {
      if (add) $form.group.push(group);
      else $form.group = $form.group.filter((g) => g.id != group.id);
      return $form;
    });
  }
</script>

<SuperDebug data={$form} />

{#if $message}<h4>{$message}</h4>{/if}

<form method="POST" use:enhance>
  {#each data.groups as group (group.id)}
    <label>
      <input
        class="checkbox"
        type="checkbox"
        checked={!!$form.group.find((g) => g.id == group.id)}
        on:click={(e) => toggleGroup(group, e.currentTarget.checked)}
      />
      <span>{group.name}</span>
    </label>
  {/each}
  <div>
    <button>Submit</button>
  </div>
</form>

<style lang="scss">
  form {
    margin: 2rem 0;
  }
</style>
