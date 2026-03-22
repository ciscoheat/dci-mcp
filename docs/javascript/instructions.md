## JavaScript-Specific Implementation

### Context Implementation

- A Context is a function annotated with `@DCI-context`. If that doesn't exist, _do not_ apply DCI.
- Contexts and their RoleMethods can be async functions when needed.

### Role Organization

- Use `//#region RoleName Role /////` and `//#endregion` comments to group RoleMethods by Role. This enables easy folding/unfolding of Roles in the editor.

### Role Contracts

- Use literal types in JSDoc as Role Contracts, so the code can be understood without deeper type knowledge. Example:

```js
/** @type {{ action: string }} */
const Form = event.target;
```

- EXCEPTION: If the types are well-known, like the JavaScript Web APIs, you can reference them directly (e.g., `Page`, `HTMLElement`). Example:

```js
/** @type {Page} */
const Page = await Browser.newPage();
```

- If an object is passed to the Context function that fits the mental model of a Context Role, the Role should be defined from it with the Role Contract as the parameter type. Example:

```js
/**
 * @DCI-context
 * A speaker proclaims something to the world, that dutifully notes it
 */
function HelloWorld(
  /** @type {{ phrase: string }} */ Speaker,
  /** @type {{ log: (msg: unknown) => void }} */ World,
) {
  function Speaker_proclaim() {
    World_note(Speaker.phrase);
  }

  function World_note(phrase) {
    World.log(phrase);
  }

  Speaker_proclaim();
}
```

- A Role defined _inside_ the Context body on the other hand, **must be placed immediately inside its `//#region` block before the RoleMethods** - never at the top of the Context or anywhere else. The Role and its RoleMethods must always be co-located so the contract and behavior are readable together.

### RoleMethod Naming

- RoleMethods are functions within the Context scope, named `Role_method()`. Example: `Speaker_proclaim()`, `World_note()`
- Internal (private) RoleMethods, callable only by RoleMethods in the same Role, use a double underscore: `Role__method()`.

### Type Annotations

- Use JSDoc for typing, and `@ts-check` on top if creating a new file.
- Use `@DCI-context` tag to mark Context functions.
- Clarify Role Contracts with explicit types inline.
- Prefer inline literal types over separate type declarations for Role Contracts.
