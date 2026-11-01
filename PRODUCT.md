# Product

## Register

product

## Users

Three groups, three very different sessions:

- **Project managers** run the day from this app: they open a project, check what moved, answer the client, and chase the budget. Desktop, many tabs, interrupted constantly.
- **Developers and designers** touch it in short bursts: pick up a ticket, move it, log the hour before they forget. Often late in the evening, often with the room lights low.
- **Clients** open the portal maybe once a week, on a laptop, to see whether the thing they paid for is moving and to sign off a stage. They have no training and no patience for a tool.

The job to be done: know where the work stands without asking anyone.

## Product Purpose

A project tracker sized for a small web-development studio: projects created from client requests, a workflow you build yourself, per-project crews, tickets on a board, time logged against a budget in hours or a fixed price, documents next to the work, and a client-facing portal whose contents are configured per project.

Success is that nobody in the studio needs a spreadsheet alongside it, and that a client can answer "how is my project going" without writing an email.

## Brand Personality

Quiet, exact, unhurried. The interface states facts: this many hours, this status, this person, this date. It never celebrates, never nags, never decorates. Confidence comes from the numbers being right and easy to find, not from the styling.

Voice in the UI: plain sentences, no exclamation marks, no cheerleading. A label says what will happen when you press it.

## Anti-references

- **Jira.** Overloaded panels, nested frames, a toolbar of ten buttons where two would do, everything grey and equally important.
- **"Hacker" dark mode.** Neon green on pure black, monospace everywhere, terminal cosplay. Dark mode here is a dim room, not a cyberpunk set.
- **Indigo/violet SaaS gloss.** Gradient headings, glass cards, glow. The current palette starts from that default and should leave it.
- **Landing page dressed as a tool.** Huge headings and empty space where work should fit.

## Design Principles

1. **The numbers are the design.** Hours, money, dates, counts are the reason anyone opens this. They get the clearest type, tabular figures, and the strongest alignment; the chrome around them stays quiet.
2. **Colour means something or it isn't there.** Hue is reserved for status, priority, budget pressure, and the current selection. Nothing is coloured to look nice.
3. **Same thing, same shape, everywhere.** One button vocabulary, one field, one badge, one table. A screen the user has never opened should still be readable on sight.
4. **The client portal is the studio's face.** It is the only surface a customer sees, so it gets the same care as the marketing site the studio would build for itself, while staying a tool rather than a brochure.
5. **Honest states.** Empty, loading, blocked, over budget, and refused-transition are designed on purpose, with a sentence that says what to do next.
6. **A model drafts; a person decides.** Where the tracker uses a model it produces text a human reads and chooses to keep — never a number, never a decision, never a message to a client, never a silent write. Nothing is sent anywhere until both the studio and the individual project have said yes, and what was sent is recorded. The feature is absent, not degraded, when it is switched off.
7. **A reminder is a fact, not a nag.** The tracker says "due 3 days ago", never "don't forget!". The attention panel is absent when there is nothing to say — an always-present "all clear" is a thing people learn to skip past, and the point of this one is that its presence means something. Every line names a date or a number the reader can go and check.

## Accessibility & Inclusion

- WCAG 2.2 AA: body text at 4.5:1 or better, large text and non-text UI at 3:1, including placeholders and muted captions.
- Never colour alone. Status carries a label, budget pressure carries a number, priority carries a word.
- Visible focus on every interactive element, keyboard reachable, in both themes.
- `prefers-reduced-motion` is honoured for every transition.
- Light and dark are both first-class; the choice is remembered per person and follows the system by default.
