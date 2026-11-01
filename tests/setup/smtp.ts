import net from "node:net";

/**
 * A throwaway SMTP server, just enough of one to hold a real conversation.
 *
 * lib/mail.ts is the one place in the app that talks a wire protocol to
 * something outside it, and mocking nodemailer would only test the mock — the
 * upgrade that breaks it will be one that changes what goes over the socket,
 * not one that changes the function names. So this listens on a real port and
 * answers real commands, and the test asserts on the message that arrived.
 *
 * It speaks the smallest dialect nodemailer will accept: no STARTTLS and no
 * AUTH are advertised, which keeps the exchange plain and the setup free of
 * certificates.
 */
export type FakeSmtp = {
  port: number;
  /** Each message the server accepted, headers and body, as it arrived. */
  messages: string[];
  /** While true, recipients are refused the way a real server refuses one. */
  refuse: boolean;
  close: () => Promise<void>;
};

export async function startFakeSmtp(): Promise<FakeSmtp> {
  const state = { messages: [] as string[], refuse: false };
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    // Nothing here should outlive the test that opened it.
    socket.on("error", () => {});

    let pending = "";
    let collecting = false;
    let message = "";

    const finishMessage = () => {
      const [body] = message.split("\r\n.\r\n");
      state.messages.push(body);
      message = "";
      collecting = false;
      socket.write("250 2.0.0 Ok: queued\r\n");
    };

    socket.write("220 localhost ESMTP fake\r\n");

    socket.on("data", (chunk) => {
      pending += chunk.toString("utf8");

      // Inside DATA every byte belongs to the message until the lone dot.
      if (collecting) {
        message += pending;
        pending = "";
        if (message.includes("\r\n.\r\n")) finishMessage();
        return;
      }

      let end: number;
      while ((end = pending.indexOf("\r\n")) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);

        switch (line.split(" ")[0].toUpperCase()) {
          case "EHLO":
          case "HELO":
            socket.write("250-localhost\r\n250 SIZE 10240000\r\n");
            break;

          case "MAIL":
          case "RSET":
          case "NOOP":
            socket.write("250 2.0.0 Ok\r\n");
            break;

          case "RCPT":
            if (state.refuse) {
              // Quoting the address back is exactly what a real rejection does,
              // and it is why lib/mail.ts redacts before it logs.
              const address = line.slice(line.indexOf(":") + 1).trim();
              socket.write(`550 5.1.1 ${address}: Recipient address rejected\r\n`);
            } else {
              socket.write("250 2.0.0 Ok\r\n");
            }
            break;

          case "DATA":
            socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
            collecting = true;
            message = pending;
            pending = "";
            if (message.includes("\r\n.\r\n")) finishMessage();
            break;

          case "QUIT":
            socket.write("221 2.0.0 Bye\r\n");
            socket.end();
            break;

          default:
            socket.write("502 5.5.2 Not implemented\r\n");
        }

        if (collecting) break;
      }
    });
  });

  // Port 0: the operating system picks a free one, so a developer already
  // running something on a guessed port does not get a mystery failure.
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("Fake SMTP server did not bind to a port");
  }

  return {
    port: address.port,
    get messages() {
      return state.messages;
    },
    get refuse() {
      return state.refuse;
    },
    set refuse(value: boolean) {
      state.refuse = value;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
