## TypeScript DCI Examples

### AJAX form submit with dynamic error display

- Notable as a "one off" operation, nothing is returned from the Context function.
- Also demonstrates the basics of Context error handling by using a single try/catch around the System Operation part, to avoid errors leaking outside the RoleMethods.

```ts
/**
 * Submit a form and show error messages from the response.
 * @DCI-context
 */
async function SubmitForm(e: SubmitEvent) {
  if (!(e.target instanceof HTMLFormElement)) throw new Error("No form found.");

  //#region Form Role ////////////////////

  const Form: { action: string } = e.target;

  async function Form_submit() {
    // Role contract: Form.action
    const response = await fetch(Form.action, {
      method: "POST",
      body: new FormData(Form as HTMLFormElement),
    });
    const data = await response.json();
    for (const error of data.errors ?? []) Messages_show(error); // Role interaction
  }

  //#endregion

  //#region Messages Role ////////////////////

  const Messages: Iterable<{
    dataset: DOMStringMap;
    style: CSSStyleDeclaration;
  }> = e.target.querySelectorAll<HTMLElement>("[data-form-message]");

  async function Messages_hide() {
    Messages__set("none");
    await Form_submit(); // Role interaction
  }

  function Messages_show(name: string) {
    Messages__set("unset", name);
  }

  function Messages__set(display: string, name = "") {
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
- The Roles are defined in the *Context arguments*, so they will not have their common place before their RoleMethods, which they would if they were defined inside the Context.
- The System Operation (initial RoleMethod call) is started right away, as all Roles are defined in the Context arguments.

```ts
/**
 * Sets locals.user and locals.session on success, otherwise null.
 * @DCI-context
 */
export async function ValidateSession(
  Request: RequestEvent,
  Session = db,
  INVALIDATE = false
): Promise<void> {
  await Request_getTokenFromCookie();

  //#region Request //////////////////////////////

  async function Request_getTokenFromCookie() {
    const token = Request.cookies.get(COOKIE_NAME);

    if (!token) Request_clearSession();
    else await Session_findByToken(token);
  }

  function Request_setSession(token: string, session: Session, user: User) {
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

  function Request_clearSession(): void {
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

  async function Session_findByToken(token: string) {
    const sessionId = encodeHexLowerCase(
      sha256(new TextEncoder().encode(token))
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

  async function Session_checkExpiryDate(
    token: string,
    session: Session,
    user: User
  ) {
    if (INVALIDATE || Date.now() >= session.expiresAt.getTime()) {
      await Session.delete(sessionTable).where(eq(sessionTable.id, session.id));
      Request_clearSession();
    } else {
      await Session_refreshExpiryDate(token, session, user);
    }
  }

  async function Session_refreshExpiryDate(
    token: string,
    session: Session,
    user: User
  ) {
    if (
      Date.now() >=
      session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * (EXPIRY_DAYS / 2)
    ) {
      session.expiresAt = new Date(
        Date.now() + 1000 * 60 * 60 * 24 * EXPIRY_DAYS
      );
      await Session
        .update(sessionTable)
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
- The `Screen` and `Printer` Roles are defined in the *Context arguments*, so they will not have their common place before their RoleMethods, which they would if they were defined inside the Context, as the other Roles are.

```ts
import { Display, type ScreenState } from "$lib/assets/screen/screenStates";
import { title } from "$lib/data/libraryItem";
import { cards, library, loans } from "$lib/library";
import { hash } from "$lib/utils";
import { BorrowItem } from "./borrowItem";

/**
 * A book borrowing machine at a public library.
 * @DCI-context
 */
export function LibraryMachine(
  Screen: {
    display: (state: ScreenState) => void;
    currentState: () => ScreenState;
  },
  Printer: {
    print: (line: string) => void;
  }
) {
  //#region Borrower /////

  let Borrower: {
    "@id": string;
    "@type": "Person";
    items: { id: string; title: string; expires: Date }[];
  };

  function Borrower_isLoggedIn() {
    // A getter is ok if it is descriptive beyond "get" and returns a boolean
    return !!Borrower["@id"];
  }

  function Borrower_login(user: Pick<typeof Borrower, "@id" | "@type">) {
    rebind(user["@id"]);
    Screen_displayItems(Borrower.items);
  }

  /**
   * @param forced Whether the logout was forced by the user (e.g. card removed)
   */
  function Borrower_logout(forced: boolean, printItems: boolean) {
    // Need to print before rebinding, as it will clear the items
    if (printItems) Printer_printReceipt(Borrower.items);

    if (Borrower_isLoggedIn()) rebind(undefined);
    Screen_displayThankYou(forced);
  }

  function Borrower_borrowItem(itemId: string | undefined) {
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

  const CardReader: { currentId: string; attempts: number } = {
    currentId: "",
    attempts: 0,
  };

  function CardReader_cardScanned(id: string | undefined) {
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

  function CardReader_validatePIN(pin: string[]) {
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

  function Library_validateCard(cardId: string, pin: string[]) {
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

  function Screen_displayEnterPIN(attempts: number) {
    Screen.display({ display: Display.EnterPIN, attempts });
  }

  function Screen_displayItems(items: { title: string; expires: Date }[]) {
    Screen.display({ display: Display.Items, items });
  }

  function Screen_displayThankYou(forced: boolean) {
    if (forced && Screen.currentState().display === Display.ThankYou) {
      Screen_displayWelcome();
    } else {
      Screen.display({ display: Display.ThankYou });
      if (forced) Screen__displayNext({ display: Display.Welcome });
    }
  }

  function Screen_displayError(error: Error) {
    // Log out user
    rebind(undefined);
    Screen.display({ display: Display.Error, error });
    Screen__displayNext({ display: Display.Welcome }, 10000);
  }

  function Screen__displayNext(nextState: ScreenState, delay = 5000) {
    const currentState = Screen.currentState();
    setTimeout(() => {
      if (currentState === Screen.currentState()) Screen.display(nextState);
    }, delay);
  }

  //#endregion

  //#region Printer /////

  async function Printer_printReceipt(
    items: { title: string; expires: Date }[]
  ) {
    if (items.length) {
      await Printer__printLine(new Date().toISOString().slice(0, 10));
      await Printer__printLine("");
      for (const item of items) {
        await Printer__printLine(item.title);
        await Printer__printLine(
          "Return on " + item.expires.toISOString().slice(0, 10)
        );
        await Printer__printLine("");
      }
    }
  }

  async function Printer__printLine(line: string) {
    Printer.print(line);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  //#endregion

  /**
   * Reset the Context state, rebind to a new user or undefined (not logged in).
   */
  function rebind(userId: string | undefined) {
    Borrower = { "@id": userId ?? "", "@type": "Person", items: [] };
    CardReader_resetAttempts();
  }

  {
    // Context start
    rebind(undefined);
    Screen_displayWelcome();

    return {
      cardScanned(id: string | undefined) {
        CardReader_cardScanned(id);
      },

      itemScanned(id: string | undefined) {
        Borrower_borrowItem(id);
      },

      pinEntered(pin: string[]) {
        CardReader_validatePIN(pin);
      },

      finish(printReceipt: boolean) {
        Borrower_logout(false, printReceipt);
      },
    };
  }
}
```
