<script lang="ts">
  import { page } from '$app/stores';
  import { superForm } from '$lib/client';
  import SuperDebug from '$lib/client/SuperDebug.svelte';

  export let data;

  const { form, errors, message, enhance } = superForm(data.form, {
    dataType: 'json',
    taintedMessage: null,
    validators: {
      business_id: (input) =>
        input ? undefined : 'Please fill business name first'
      /*
      // Uncomment for testing purposes, but will fail browser test
      shareholders: {
        id_issuance_date: (date) => (date ? 'Nope' : null)
      }
      */
    },
    onError({ result, message }) {
      console.log('error');
      console.log(result);
      console.log(message);
    }
  });
</script>

<h3>Add shareholder</h3>

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
    Business name
    <input bind:value={$form.business_id} />
    {#if $errors.business_id}<span class="invalid"
        >{$errors.business_id}</span
      >{/if}
  </label>

  <button
    type="button"
    on:click={() =>
      ($form.shareholders = [
        ...$form.shareholders,
        { id_issuance_date: new Date() }
      ])}>Add shareholder</button
  >

  {#if $errors?.shareholders?._errors}
    <div class="invalid">{$errors.shareholders._errors}</div>
  {/if}

  {#each $form.shareholders as _, i}
    {@const error = $errors?.shareholders?.[i]?.id_issuance_date}
    <label>
      Issuance date<br />
      <input
        aria-invalid={error ? 'true' : undefined}
        bind:value={$form.shareholders[i].id_issuance_date}
      />
      {#if error}
        <span class="invalid"
          >{$errors?.shareholders?.[i].id_issuance_date}</span
        >
      {/if}
    </label>
  {/each}

  <div>
    <br />
    <button>Submit</button>
  </div>
</form>

<SuperDebug data={{ $form, $errors }} />

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

  form {
    padding-top: 1rem;
    padding-bottom: 1rem;
  }
</style>
