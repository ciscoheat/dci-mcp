## JavaScript DCI Examples

### AJAX form submit with dynamic error display

- Notable as a "one off" operation, nothing is returned from the Context function.
- Also demonstrates the basics of Context error handling by using a single try/catch around the System Operation part, to avoid errors leaking outside the RoleMethods.

```js
/**
 * Submit a form and show error messages from the response.
 * @DCI-context
 * @param {SubmitEvent} e
 */
async function SubmitForm(e) {
  if (!(e.target instanceof HTMLFormElement)) throw new Error("No form found.");

  //#region Form Role ////////////////////

  /** @type {{ action: string }} */
  const Form = e.target;

  async function Form_submit() {
    // Role contract: Form.action
    const response = await fetch(Form.action, {
      method: "POST",
      body: new FormData(Form),
    });
    const data = await response.json();
    for (const error of data.errors ?? []) Messages_show(error); // Role interaction
  }

  //#endregion

  //#region Messages Role ////////////////////

  const Messages = e.target.querySelectorAll("[data-form-message]");

  async function Messages_hide() {
    Messages__set("none");
    await Form_submit(); // Role interaction
  }

  /** @param {string} name */
  function Messages_show(name) {
    Messages__set("unset", name);
  }

  /**
   * @param {string} display
   * @param {string} [name]
   */
  function Messages__set(display, name = "") {
    for (const msg of Messages) {
      if (name && msg.dataset.formMessage != name) continue;
      msg.style.display = display;
    }
  }

  //#endregion

  try {
    console.log("Submit");
    e.preventDefault();
    await Messages_hide(); // System operation
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
}
```

### Session validation for SvelteKit and Drizzle

- Another "one off" operation, where ultimately the Request is modified to have valid or invalid session data.
- The Roles are defined in the _Context arguments_, so they will not have their common place before their RoleMethods, which they would if they were defined inside the Context.
- The System Operation (initial RoleMethod call) is started right away, as all Roles are defined in the Context arguments.

```js
/**
 * Sets locals.user and locals.session on success, otherwise null.
 * @DCI-context
 * @param {import('@sveltejs/kit').RequestEvent} Request
 * @param {typeof db} [Session]
 * @param {boolean} [INVALIDATE]
 * @returns {Promise<void>}
 */
export async function ValidateSession(
  Request,
  Session = db,
  INVALIDATE = false,
) {
  await Request_getTokenFromCookie();

  //#region Request //////////////////////////////

  async function Request_getTokenFromCookie() {
    const token = Request.cookies.get(COOKIE_NAME);

    if (!token) Request_clearSession();
    else await Session_findByToken(token);
  }

  /**
   * @param {string} token
   * @param {import('$lib/db').Session} session
   * @param {import('$lib/db').User} user
   */
  function Request_setSession(token, session, user) {
    Object.freeze(user);
    Object.freeze(session);

    Request.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      expires: session.expiresAt,
      path: "/",
    });

    Request.locals.user = user;
    Request.locals.session = session;
  }

  function Request_clearSession() {
    Request.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    Request.locals.user = undefined;
    Request.locals.session = undefined;
  }

  //#region Session ////////////////////////////////////////

  /** @param {string} token */
  async function Session_findByToken(token) {
    const sessionId = encodeHexLowerCase(
      sha256(new TextEncoder().encode(token)),
    );

    const [result] = await Session.select({
      user: userTable,
      session: sessionTable,
    })
      .from(sessionTable)
      .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
      .where(eq(sessionTable.id, sessionId))
      .limit(1);

    if (!result) Request_clearSession();
    else await Session_checkExpiryDate(token, result.session, result.user);
  }

  /**
   * @param {string} token
   * @param {import('$lib/db').Session} session
   * @param {import('$lib/db').User} user
   */
  async function Session_checkExpiryDate(token, session, user) {
    if (INVALIDATE || Date.now() >= session.expiresAt.getTime()) {
      await Session.delete(sessionTable).where(eq(sessionTable.id, session.id));
      Request_clearSession();
    } else {
      await Session_refreshExpiryDate(token, session, user);
    }
  }

  /**
   * @param {string} token
   * @param {import('$lib/db').Session} session
   * @param {import('$lib/db').User} user
   */
  async function Session_refreshExpiryDate(token, session, user) {
    if (
      Date.now() >=
      session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * (EXPIRY_DAYS / 2)
    ) {
      session.expiresAt = new Date(
        Date.now() + 1000 * 60 * 60 * 24 * EXPIRY_DAYS,
      );
      await Session.update(sessionTable)
        .set({
          expiresAt: session.expiresAt,
        })
        .where(eq(sessionTable.id, session.id));
    }

    Request_setSession(token, session, user);
  }
}
```

### A book borrowing machine at a public library

- Notable as it returns an object from the Context, similar to a class with public methods.
- The `Screen` and `Printer` Roles are defined in the _Context arguments_, so they will not have their common place before their RoleMethods, which they would if they were defined inside the Context, as the other Roles are.

```js
import { Display } from "$lib/assets/screen/screenStates";
import { title } from "$lib/data/libraryItem";
import { cards, library, loans } from "$lib/library";
import { hash } from "$lib/utils";
import { BorrowItem } from "./borrowItem";

/**
 * A book borrowing machine at a public library.
 * @DCI-context
 * @param {{ display: (state: object) => void, currentState: () => object }} Screen
 * @param {{ print: (line: string) => void }} Printer
 */
export function LibraryMachine(Screen, Printer) {
  //#region Borrower /////

  /** @type {{ "@id": string, "@type": "Person", items: { id: string, title: string, expires: Date }[] }} */
  let Borrower;

  function Borrower_isLoggedIn() {
    // A getter is ok if it is descriptive beyond "get" and returns a boolean
    return !!Borrower["@id"];
  }

  /** @param {{ "@id": string, "@type": string }} user */
  function Borrower_login(user) {
    rebind(user["@id"]);
    Screen_displayItems(Borrower.items);
  }

  /**
   * @param {boolean} forced Whether the logout was forced by the user (e.g. card removed)
   * @param {boolean} printItems
   */
  function Borrower_logout(forced, printItems) {
    // Need to print before rebinding, as it will clear the items
    if (printItems) Printer_printReceipt(Borrower.items);

    if (Borrower_isLoggedIn()) rebind(undefined);
    Screen_displayThankYou(forced);
  }

  /** @param {string | undefined} itemId */
  function Borrower_borrowItem(itemId) {
    // TODO: Built-in security (assertions) for required login
    if (!Borrower_isLoggedIn() || !itemId) return;

    if (Borrower.items.find((item) => item.id === itemId)) return;

    // Call nested context
    const loan = BorrowItem(library, Borrower, { "@id": itemId }, loans);

    // TODO: Error handling (logging) for expected errors
    if (loan instanceof Error) return Screen_displayError(loan);

    Borrower.items.push({
      id: loan.object["@id"],
      title: title(loan.object),
      expires: loan.endTime,
    });

    Screen_displayItems(Borrower.items);
  }

  //#endregion

  //#region CardReader /////

  const CardReader = {
    currentId: "",
    attempts: 0,
  };

  /** @param {string | undefined} id */
  function CardReader_cardScanned(id) {
    if (CardReader.currentId == id) return;

    if (!id) {
      // Card removed or missing
      if (CardReader.currentId) Borrower_logout(true, false);
    } else {
      // Card scanned
      if (!Borrower_isLoggedIn()) {
        // New card
        Screen_displayEnterPIN(0);
      }
    }

    CardReader.currentId = id ?? "";
  }

  function CardReader_resetAttempts() {
    CardReader.attempts = 0;
  }

  /** @param {string[]} pin */
  function CardReader_validatePIN(pin) {
    Library_validateCard(CardReader.currentId, pin);
  }

  function CardReader_PINfailed() {
    // TODO: Force remove card after 3 failed attempts
    Screen_displayEnterPIN(++CardReader.attempts);
  }

  //#endregion

  //#region Library /////

  const Library = {
    cards,
  };

  /**
   * @param {string} cardId
   * @param {string[]} pin
   */
  function Library_validateCard(cardId, pin) {
    const card = Library.cards.find((card) => card["@id"] === cardId);
    if (card && card.identifier === hash(pin.join(""))) {
      Borrower_login(card._owner);
    } else {
      CardReader_PINfailed();
    }
  }

  //#endregion

  //#region Screen /////

  function Screen_displayWelcome() {
    Screen.display({ display: Display.Welcome });
  }

  /** @param {number} attempts */
  function Screen_displayEnterPIN(attempts) {
    Screen.display({ display: Display.EnterPIN, attempts });
  }

  /** @param {{ title: string, expires: Date }[]} items */
  function Screen_displayItems(items) {
    Screen.display({ display: Display.Items, items });
  }

  /** @param {boolean} forced */
  function Screen_displayThankYou(forced) {
    if (forced && Screen.currentState().display === Display.ThankYou) {
      Screen_displayWelcome();
    } else {
      Screen.display({ display: Display.ThankYou });
      if (forced) Screen__displayNext({ display: Display.Welcome });
    }
  }

  /** @param {Error} error */
  function Screen_displayError(error) {
    // Log out user
    rebind(undefined);
    Screen.display({ display: Display.Error, error });
    Screen__displayNext({ display: Display.Welcome }, 10000);
  }

  /**
   * @param {object} nextState
   * @param {number} [delay]
   */
  function Screen__displayNext(nextState, delay = 5000) {
    const currentState = Screen.currentState();
    setTimeout(() => {
      if (currentState === Screen.currentState()) Screen.display(nextState);
    }, delay);
  }

  //#endregion

  //#region Printer /////

  /** @param {{ title: string, expires: Date }[]} items */
  async function Printer_printReceipt(items) {
    if (items.length) {
      await Printer__printLine(new Date().toISOString().slice(0, 10));
      await Printer__printLine("");
      for (const item of items) {
        await Printer__printLine(item.title);
        await Printer__printLine(
          "Return on " + item.expires.toISOString().slice(0, 10),
        );
        await Printer__printLine("");
      }
    }
  }

  /** @param {string} line */
  async function Printer__printLine(line) {
    Printer.print(line);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  //#endregion

  /**
   * Reset the Context state, rebind to a new user or undefined (not logged in).
   * @param {string | undefined} userId
   */
  function rebind(userId) {
    Borrower = { "@id": userId ?? "", "@type": "Person", items: [] };
    CardReader_resetAttempts();
  }

  {
    // Context start
    rebind(undefined);
    Screen_displayWelcome();

    return {
      /** @param {string | undefined} id */
      cardScanned(id) {
        CardReader_cardScanned(id);
      },

      /** @param {string | undefined} id */
      itemScanned(id) {
        Borrower_borrowItem(id);
      },

      /** @param {string[]} pin */
      pinEntered(pin) {
        CardReader_validatePIN(pin);
      },

      /** @param {boolean} printReceipt */
      finish(printReceipt) {
        Borrower_logout(false, printReceipt);
      },
    };
  }
}
```
