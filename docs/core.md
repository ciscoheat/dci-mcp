# Instructions for Writing Code with the DCI Paradigm

> **DCI: Data, Context and Interaction:**
> DCI is a programming paradigm that separates _what the system is_ (domain knowledge/data models) from _what the system does_ (behavior/functionality), bridging human mental models and code.

## 1. Core DCI Architecture

- DCI code is organized around three projections:

### Data ("What the system _is_")

- Domain objects, with simple properties and methods that only regards its own data.
- Pure data structures that represent the state of the system.
- Classes or types that do NOT contain interaction logic relevant to the current use case.

### Context ("What the system _does_")

- Encapsulates a _use case_ based on a mental model.
- Orchestrates interactions between Data objects by assigning them **Roles** at runtime.
- The (public) properties of these Data objects form the **Role Contracts**, a partial interface for accessing the role-playing object by its Role.
- A Context encapsulates one complete use case or user story, with all variations expressed in the Context.

### Interaction ("How the system does it")

- Specifies _how_ objects collaborate inside a Context - via **RoleMethods**.
- RoleMethods define the behavior of objects playing specific Roles.
- IMPORTANT: ONLY the Role's own RoleMethods can access its Role Contract (the underlying object properties) directly. There CAN NOT be any access to the Role Contract from outside the RoleMethods of that Role, not even from other RoleMethods of other Roles. The only way to access the Role Contract from other Roles is through RoleMethod calls.
- Internal (private) RoleMethods are callable _only_ by RoleMethods in the same Role.
- Interactions should favor "ask, don't tell" (objects request services, not micromanage).
- The starting point for a Role interaction (a flow of messages through the Context) is called a **System Operation**.
- In a true DCI runtime, RoleMethods are attached _dynamically_ to the objects playing the Roles, and only exist during Context execution, but this is language- and implementation-specific.

## 2. DCI Principles & Key Concepts

### Mental Model Alignment

- DCI code should map closely to how users think about the domain.
- The RoleMethods should express what the user wants the role-playing objects to do, based on their properties.

### Roles

- Role = An identifier for an object in a Context; not a reusable type.
- Objects can play a Role if they fulfill the Role's contract (literal type).
- Roles are _not wrappers_; object identity MUST be preserved.

### Object Identity

- Real objects, not proxies or wrappers, play Roles to maintain their identity.

### Separation of Concerns

- Domain knowledge (Data) evolves slowly; use case logic (Context/Interaction) changes rapidly.
- Keep these separate for maintainability.

### Readability

- Gather use case logic in one place (the Context).
- Use comments and types to clarify contracts and intent.

### Runtime Focus

- DCI describes system behavior _at runtime_, not just compile-time structure.

### Agile Support

- DCI supports practices like iterative development, clear mental models, and adaptation to change.

### When not to use DCI

- DCI is best suited for use cases where there are two or more interacting actors.
- For simple operations like CRUD, or purely functional data transformation, do not use DCI.
- If a use case tends to contain only one Role or be specific enough not to express a genericity of its Role interfaces, do not use DCI.

## 3. DCI Analogies

### Movie Script

- The Context is the script; objects are actors; Roles are character parts.
- Objects (actors) can play different Roles in different Contexts (scenes).

### Train System

- Instead of modeling trains or stations individually, DCI models their patterns of interaction (e.g., station visits).

### Automated factory

- When producing different products, the factory (Context) assigns machines (objects) to different Roles based on the product being made.
- The product is passed between the machines (through Role Method arguments), each using its Role Contract to modify or use it, until the goal of the Context has been achieved.

### Extending the Context

- Extending the Context (adding variations to the use case) should be like rewiring cables (RoleMethod calls), not changing domain objects. The simple data playing the Context Roles should be able to play a part in many different scenarios through their interfaces.

## 4. DCI Code Generation Workflow

1. **Start with the Use Case**

- What does the user want to _achieve_?
- Define this as a Context.
- If a mental model or use case is supplied, use it as a foundation for the Roles and RoleMethods.
- Do NOT name the context "SubmitContext" or similar, but rather after the use case (e.g., `SubmitForm`, `LibraryMachine`).

2. **Identify Roles**

- What objects collaborate for this use case?
- Roles must be located _inside_ the Context.
- Roles should be played by _objects_, not primitive types. Primitive types passed to the Context, like configuration options, can be expressed as a settings object, played by a `Context` role.
- Additional Context state, usually transient, can also be added as properties to the `Context` role if few and simple, otherwise a separate Role can be created for it, usually when a Context needs to construct an object throughout its Interaction, like a `Response` to a HTTP request.
- Name the Roles meaningfully (e.g., `SourceAccount`, `Messages`), do NOT append `Role` to the name.
- DON'T add Roles that are not relevant to the use case/mental model, or just for technical reasons (e.g., a `Database` Role for database access, `ResponseComposer` for constructing a HTTP response, or roles that act like software design patterns). Instead, consider whether the technical dependency can be abstracted behind a Role Contract of an existing Role, or if it is truly needed as a separate Role.

3. **Define Role Contracts**

- What properties/methods must an object have for its Role, for the Context goal to be fulfilled?
- Define clear, minimal contracts that specify the interface needed for each Role.
- Use the language's type system to express these contracts explicitly.

4. **Implement RoleMethods**

- Write interaction logic _inside_ the Context.
- Group RoleMethods by Role for clarity.
- RoleMethods should be kept together. No mixing of RoleMethods or other instructions between RoleMethods belonging to the same role.
- DON'T add RoleMethods without Roles, that's just helper functions in disguise. RoleMethods MUST have a corresponding Role identifier with a Contract, so they further the Context goal ("doing their part" in the use case) and are not just utility functions, which _can_ exist on a Role but usually as private RoleMethods.
- Most of the time, RoleMethods should "chain" together the Interaction in progress, meaning that at the end of a RoleMethod, another RoleMethod of a Role is called, passing on relevant data as arguments, further fulfilling the purpose of the Context according to the mental model. This chaining avoids the dependency on return values and makes it easier to "rewire" the context later if requirements change, or new functionality is added.
- If a RoleMethod is called only once in the Context, it is usually better to inline its logic into the caller RoleMethod to avoid unnecessary indirection. But if it is called multiple times, or if it is a distinct step in the use case that can be clearly named, it can be a separate RoleMethod (if it can be connected to a relevant Role).

5. **Focus on Interaction**

- RoleMethods should coordinate with other Roles ("ask"), not dictate ("tell").
- When data is acquired or created within a RoleMethod, for example through a Role Contract method call, if needed by other Roles it should be passed to other RoleMethods, expressing the interaction and collaboration of the Roles - true object-orientation.
- Return values should be avoided if possible (think message-passing that ultimately modifies state), but is not prohibited, for example an occasional boolean check. Readability is the goal, not enforcing rules that complicates the code.

6. **Keep Data Pure**

- Domain objects (classes/types) must NOT contain Context-specific logic.

7. **Preserve Object Identity**

- Role wrappers can lead to subtle bugs with strict equality checks, so NEVER wrap objects for Role assignment - always use direct references.

8. **Role-binding**

- All Roles _must_ be bound (assigned) either during the Context initialization, or in a single `rebind` function that reassigns _all_ Roles.
- If one or more Roles must change during the Context execution, prefer reinstantiating the Context again, or use the `rebind` function to avoid recursion for example.
- Roles _can_ be bound to null, but is unusual and a good reason must exist for that.

9. **Nested Contexts**

- If a RoleMethod's logic represents a _reusable_, _distinct_ use case, consider implementing it as a separate Context. This keeps Contexts focused and manageable.
- Calling such a Context within another is called "nesting" Contexts.
- Follow the rules about when not to use DCI to determine whether to use nested Contexts.

10. **Documentation**

- Document Contexts clearly with their purpose and use case.
- Clarify Role Contracts with appropriate type annotations or comments.
