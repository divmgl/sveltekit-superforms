<script lang="ts">
  import { page } from '$app/stores';
  import { superForm } from '$lib/client';
  import SuperDebug from '$lib/client/SuperDebug.svelte';
  import { schema } from './schema';

  export let data;

  const { form, errors, message, constraints, enhance, tainted } = superForm(
    data.form,
    { validators: schema, taintedMessage: null }
  );
</script>

<SuperDebug collapsible data={$tainted} />

<h3>Superforms testing ground</h3>

{#if $message}
  <div
    class="status"
    class:error={$page.status >= 400}
    class:success={$page.status == 200}
  >
    {$message}
  </div>
{/if}

<form method="POST" use:enhance>
  <label>
    Name<br />
    <input
      name="name"
      aria-invalid={$errors.name ? 'true' : undefined}
      bind:value={$form.name}
    />
    {#if $errors.name}<span class="invalid">{$errors.name}</span>{/if}
  </label>

  <label>
    Second name<br />
    <input
      name="secondName"
      aria-invalid={$errors.secondName ? 'true' : undefined}
      bind:value={$form.secondName}
    />
    {#if $errors.secondName}<span class="invalid">{$errors.secondName}</span
      >{/if}
  </label>

  <button>Submit</button>
</form>

<hr />
<p>
  <a target="_blank" href="https://superforms.rocks/api">API Reference</a>
</p>

<style>
  .invalid {
    color: red;
  }

  .status {
    color: white;
    padding: 4px;
    padding-left: 8px;
    border-radius: 2px;
    font-weight: 500;
  }

  .status.success {
    background-color: seagreen;
  }

  .status.error {
    background-color: #ff2a02;
  }

  input {
    background-color: #ddd;
  }

  a {
    text-decoration: underline;
  }

  hr {
    margin-top: 4rem;
  }

  form {
    padding-top: 1rem;
    padding-bottom: 1rem;
  }
</style>
