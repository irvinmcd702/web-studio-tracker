/**
 * The in-app guide, in both languages the studio uses.
 *
 * Content as data rather than as two pages of JSX, for one reason: the English
 * and the Russian sit next to each other in the same file, so changing one
 * puts the other directly under your cursor. Two separate pages drift, and a
 * guide that describes an older version of the software is worse than none.
 *
 * The tiny markup is `**bold**`, `[text](/href)` and `` `code` `` — enough for
 * prose about an interface and not enough to grow into a templating language.
 * The `sections` of both languages must line up; a test checks that they do.
 */

export type HelpSection = {
  id: string;
  title: string;
  /** Manager-only paragraphs are shown to whoever can configure the studio. */
  paragraphs: string[];
  managerParagraphs?: string[];
  /** What everyone else is told instead, in one line. */
  insteadForMembers?: string;
};

export type HelpContent = {
  title: string;
  description: string;
  /** The label on the link to the other language. */
  otherLanguage: string;
  sections: HelpSection[];
  outro: { title: string; paragraphs: string[] };
};

export const HELP_EN: HelpContent = {
  title: "How this works",
  description:
    "What the tracker does, why it sometimes says no, and where to put things",
  otherLanguage: "Русская версия",
  sections: [
    {
      id: "day",
      title: "Your day",
      paragraphs: [
        "Start on the [Dashboard](/dashboard). If something needs you, a panel called **Needs attention** is at the top; if nothing does, the panel is not there at all. That is deliberate — a permanent “all clear” is a thing people learn to scroll past.",
        "[My tasks](/my-tasks) is everything assigned to you across every project, which is usually the list you actually want. A project’s **Board** is for seeing where that project stands.",
        "`⌘K` or `Ctrl K` anywhere opens search. Typing a ticket key — `ACME-14` — jumps straight to it.",
      ],
    },
    {
      id: "tickets",
      title: "Tickets",
      paragraphs: [
        "A ticket has two text fields and they are not the same thing. **Description** is what we know about the problem. **Done means** is the checklist of what has to be true before it moves on — written for whoever picks it up, which might be you in three weeks or an agent tonight.",
        "Writing “Done means” feels like paperwork until the first time somebody hands work back. It is also what a workflow can require before a ticket reaches QA, so on some projects it is not optional.",
        "**Estimate** is hours, and it is a guess made honestly, not a promise. It feeds the budget and the workload view; leaving it empty is better than inventing one, because an invented estimate looks exactly like a real one.",
        "**Visible to client** decides whether this ticket appears in the customer’s portal. Off by default.",
      ],
    },
    {
      id: "moving",
      title: "Moving work along",
      paragraphs: [
        "Each project follows a **workflow** — a set of statuses and the moves allowed between them. The buttons on a ticket are the moves that are legal from where it is now. If a move you expected is missing, the workflow does not have that arrow.",
        "Sometimes a move is refused with a sentence like “this ticket needs an estimate first”. That is not the tool being awkward: somebody at the studio put that rule on that arrow on purpose. The sentence always says which condition stopped it, so you can satisfy it or go and argue with whoever set it.",
        "Some moves do things afterwards — assign the ticket to you, make it visible to the client, post a comment. Those are the workflow’s own automations, and the ticket’s history records what happened.",
        "Arrows can go anywhere: back two steps, or straight past three. A project can also carry an **optional shortcut** — a move that skips a step, open only to a ticket that has already been through it. That is how “we tested this once already” gets expressed without letting the first pass skip anything.",
        "A branch or pull request naming a ticket key comments on the ticket by itself, and on some projects moves it. Name your branches after the ticket and you stop having to report twice.",
      ],
    },
    {
      id: "time",
      title: "Time",
      paragraphs: [
        "Two ways in, and they end in the same place. The **timer** on a ticket, for work happening now, and the [Timesheet](/timesheet), for filling in a week.",
        "Log it the day you do it. An hour written down a week later is a guess, and it goes on a client’s invoice looking exactly like the ones that are not.",
        "A timer left running overnight turns into hours nobody worked, so the tracker will tell you about one that has been going too long. Stop it, then correct the entry if you need to.",
      ],
    },
    {
      id: "talking",
      title: "Talking to people",
      paragraphs: [
        "**Comments** live on a ticket and are for the work. **Chat** lives on a project and is where the customer can reach you.",
        "In the project chat, an **internal note** is not shown to the client. Everything else there is. There is one composer and one switch, so read it before you press send.",
        "Type `@` to bring somebody in — `@dana can you look at this`. A list of the people you can name opens as you type, and you can search it by name as easily as by handle, so nobody has to remember handles. Arrows to choose, enter to insert.",
        "The list comes in two parts. **On this project** is its crew and its manager — who you mean nearly every time. **Sees every project** is administrators and studio managers who can read it by role without being on it, kept separate so a project of three does not disappear under a studio of managers. Both can be named, which is what escalating to a manager is.",
        "Whoever you name sees it at the top of their dashboard until they open what you named them in. The client cannot be mentioned at all, and you cannot name yourself.",
      ],
    },
    {
      id: "client",
      title: "What the client sees",
      paragraphs: [
        "Each project decides for itself what appears in the portal: tasks, hours, money, files, documents, the team. A customer sees only what that project’s switches allow, and only tickets and files marked visible.",
        "**Approvals** are the formal version of “is this alright?”. A stage is prepared, sent, and the client either approves it or asks for changes, with the date and their note kept against it. That record is the thing you point at six months later.",
        "If a customer writes and nobody answers, that shows up on the project manager’s dashboard. It is the one thing here the tracker actively nags about, because it is the most embarrassing thing to let happen quietly.",
      ],
    },
    {
      id: "meetings",
      title: "Meetings",
      paragraphs: [
        "Every project has a **Meetings** tab. Zoom, Meet and Teams all write a transcript of a call — drop the file in, or paste whatever notes you took. It is kept word for word, exactly as it arrived.",
        "**Reading it is a separate button.** Filing a transcript sends it nowhere; pressing that button sends it to the model provider, which is why it is a decision and not something that happens quietly on upload. On a project that does not allow its material to be sent, the button is not there at all and the transcript is still filed for people to read.",
        "What comes back is four lists: discussed, decided, to do, left open. Any of them can be empty — a meeting that settled nothing is a real meeting. The list sits **beside** the transcript, not instead of it; where the two disagree, the transcript is right.",
        "Anything under **to do** can be ticked and turned into tickets in one go. Nobody is assigned: a first name heard in a room is not an account. Each ticket keeps a link back to the meeting it came from, so the reason it exists is still there in six months.",
      ],
    },
    {
      id: "closed",
      title: "Closing a project",
      paragraphs: [
        "Managers see every project. **Closing** one takes it off that list: from then on it shows only to its crew, its manager, anybody holding one of its tickets, and anybody let in by name on the project’s settings page. The switch is there too.",
        "Whoever closes it is put on the list, so you cannot shut the door on yourself. On a closed project the `@` list shrinks to match — a manager who cannot open it is no longer offered, because a mention carries a piece of the text with it.",
        "**Administrators still see it, and the page names them.** They hold the database, the backups and everyone’s password reset; a switch that pretended otherwise would be describing a wall that is not there. If something must not be readable by them, it does not belong in the tracker at all.",
        "The client notices nothing: their portal shows what its own switches allow. This closes the studio’s doors, not theirs.",
      ],
    },
    {
      id: "watching",
      title: "What watches for you",
      paragraphs: [
        "The tracker points at things rather than reminding you of everything: work that is overdue, work that is due soon, work sitting in progress with no time logged against it, a timer left running, somebody who mentioned you.",
        "Every line is arithmetic on dates and hours already in the system. Nothing is predicted, and every figure can be checked against the ticket it came from. If a line looks wrong, it is describing something that is wrong.",
        "The studio can switch on a once-a-day email of the same list. Whether it is on is a decision somebody made, not a default.",
      ],
    },
    {
      id: "managers",
      title: "If you run projects",
      paragraphs: [
        "[New project](/projects/new) can start from a client request, from a **template**, or from nothing. A template carries the tickets a job of that shape needed, without assignees or statuses — work goes to whoever is on the new crew.",
        "A project’s **crew** is picked person by person. It decides who can open the project and who can be assigned its tickets; teams are a directory of who does what, not an access rule.",
      ],
      managerParagraphs: [
        "[Workload](/workload) answers “can we take this on”. Remaining hours sit in the week each ticket is due; overdue work, undated work and unestimated work are kept out of the weeks and counted separately, because folding them in would be inventing a schedule.",
        "[Reports](/reports) is where a period becomes an invoice line. Fixed-price projects report no per-period money on purpose — the hours are real, the monthly amount would not be.",
      ],
      insteadForMembers:
        "Workload and Reports are there too, for whoever runs the projects.",
    },
  ],
  outro: {
    title: "What is not on this page",
    paragraphs: [
      "How *this studio* works — branch naming, when you invoice, who talks to which client — is not software behaviour and does not belong here. Put it in [Docs](/docs), where you can edit it and where it sits next to the projects it describes.",
      "This page describes what the tracker does, so it ships with the tracker and cannot drift out of date on its own.",
    ],
  },
};

export const HELP_RU: HelpContent = {
  title: "Как это устроено",
  description:
    "Что трекер делает, почему иногда отказывает и куда что складывать",
  otherLanguage: "English version",
  sections: [
    {
      id: "day",
      title: "Ваш день",
      paragraphs: [
        "Начинайте с [дашборда](/dashboard). Если что-то требует вас, сверху появится панель **Needs attention**; если ничего не требует — панели просто нет. Так задумано: вечное «всё в порядке» глаз перестаёт замечать.",
        "[My tasks](/my-tasks) — всё, что назначено на вас по всем проектам сразу; обычно нужен именно этот список. **Board** проекта — чтобы увидеть, где стоит сам проект.",
        "`⌘K` или `Ctrl K` в любом месте открывают поиск. Наберите ключ тикета — `ACME-14` — и попадёте прямо в него.",
      ],
    },
    {
      id: "tickets",
      title: "Тикеты",
      paragraphs: [
        "У тикета два текстовых поля, и это разные вещи. **Description** — что мы знаем о задаче. **Done means** — чеклист того, что должно быть правдой, прежде чем тикет поедет дальше. Он написан для того, кто возьмёт задачу: возможно, для вас же через три недели, а возможно, для агента сегодня ночью.",
        "«Done means» кажется бюрократией ровно до первого раза, когда работу вернут. К тому же воркфлоу может требовать его заполненным, прежде чем пустить тикет в QA, — на некоторых проектах это не по желанию.",
        "**Estimate** — часы, и это честная догадка, а не обещание. Из неё считается бюджет и загрузка. Оставить пустым лучше, чем выдумать: выдуманная оценка выглядит ровно так же, как настоящая.",
        "**Visible to client** решает, попадёт ли тикет в портал заказчика. По умолчанию выключено.",
      ],
    },
    {
      id: "moving",
      title: "Как двигать работу",
      paragraphs: [
        "У каждого проекта свой **воркфлоу** — набор статусов и разрешённые переходы между ними. Кнопки на тикете — это те переходы, которые законны из текущего статуса. Если ожидаемого перехода нет, значит в воркфлоу нет такой стрелки.",
        "Иногда переход отклоняется фразой вроде «сначала нужна оценка». Это не инструмент вредничает: кто-то в студии повесил это правило на эту стрелку намеренно. В сообщении всегда сказано, какое именно условие остановило, — можно его выполнить или пойти спорить с тем, кто его поставил.",
        "Некоторые переходы после себя что-то делают: назначают тикет на вас, открывают его клиенту, пишут комментарий. Это автоматизации самого воркфлоу, и в истории тикета видно, что именно произошло.",
        "Стрелки могут вести куда угодно: назад на два шага или сразу через три вперёд. На проекте может стоять и **необязательный обход** — переход, пропускающий шаг, открытый только тому тикету, который через этот шаг уже проходил. Так выражается «мы это уже один раз тестировали», и при этом первый проход пропустить проверку не может.",
        "Ветка или пул-реквест, в названии которых есть ключ тикета, сами оставляют комментарий, а на некоторых проектах и двигают тикет. Называйте ветки по тикету — и не придётся отчитываться дважды.",
      ],
    },
    {
      id: "time",
      title: "Время",
      paragraphs: [
        "Два входа, результат один. **Таймер** на тикете — для работы, которая идёт прямо сейчас, и [Timesheet](/timesheet) — чтобы заполнить неделю.",
        "Списывайте в тот же день. Час, записанный через неделю, — это догадка, а в счёте клиенту он будет выглядеть точно так же, как настоящий.",
        "Таймер, забытый на ночь, превращается в часы, которых никто не работал, — поэтому трекер скажет вам про слишком долго идущий. Остановите, потом при необходимости поправьте запись.",
      ],
    },
    {
      id: "talking",
      title: "Как разговаривать",
      paragraphs: [
        "**Комментарии** живут на тикете и посвящены работе. **Чат** живёт на проекте, и через него с вами связывается заказчик.",
        "В чате проекта **внутренняя заметка** клиенту не видна. Всё остальное — видно. Поле ввода одно и переключатель один, так что перечитайте перед отправкой.",
        "Наберите `@`, чтобы позвать человека: `@dana посмотри вот это`. По ходу набора открывается список тех, кого здесь можно позвать, и искать в нём можно по имени не хуже, чем по хэндлу, — держать хэндлы в голове не нужно. Стрелки — выбрать, enter — вставить.",
        "Список разделён надвое. **On this project** — команда проекта и его менеджер, то есть те, кого имеют в виду почти всегда. **Sees every project** — админы и менеджеры студии, которые читают проект по должности, не будучи на нём; они вынесены отдельно, чтобы проект из трёх человек не тонул в студии из менеджеров. Позвать можно и тех и других — эскалация ровно в этом и состоит.",
        "У названного это появится наверху дашборда и погаснет, когда он откроет то, где вы его назвали. Клиента упомянуть нельзя вовсе, себя — тоже.",
      ],
    },
    {
      id: "client",
      title: "Что видит клиент",
      paragraphs: [
        "Каждый проект сам решает, что показать в портале: задачи, часы, деньги, файлы, документы, команду. Заказчик видит только то, что разрешают переключатели этого проекта, и только тикеты и файлы, помеченные видимыми.",
        "**Согласования** — формальная версия вопроса «так нормально?». Этап готовят, отправляют, клиент либо утверждает, либо просит правки, и рядом остаются дата и его комментарий. Это та запись, на которую вы покажете через полгода.",
        "Если заказчик написал, а никто не ответил, это всплывёт на дашборде менеджера проекта. Единственное, о чём трекер напоминает настойчиво, — потому что молча оставить клиента без ответа стыднее всего.",
      ],
    },
    {
      id: "meetings",
      title: "Встречи",
      paragraphs: [
        "У каждого проекта есть вкладка **Meetings**. Zoom, Meet и Teams сами пишут расшифровку звонка — положите файл или вставьте свои заметки. Хранится дословно, ровно в том виде, в каком пришло.",
        "**Прочитать — отдельная кнопка.** Загрузка не отправляет никуда ничего; кнопка отправляет расшифровку провайдеру модели, поэтому это решение, а не побочный эффект загрузки. На проекте, который не разрешает отправлять свой материал, кнопки просто нет, а расшифровка всё равно лежит и её читают люди.",
        "Обратно приходят четыре списка: обсудили, решили, к исполнению, осталось открытым. Любой может быть пустым — встреча, которая ничего не решила, это нормальная встреча. Список стоит **рядом** с расшифровкой, а не вместо неё: где они расходятся, прав исходный текст.",
        "Пункты из **к исполнению** отмечаются галочками и разом превращаются в тикеты. Исполнителя никто не проставляет: имя, прозвучавшее в комнате, — это не учётная запись. У каждого тикета остаётся ссылка на встречу, так что через полгода будет видно, откуда он взялся.",
      ],
    },
    {
      id: "closed",
      title: "Закрытый проект",
      paragraphs: [
        "Менеджеры видят все проекты. **Закрытие** убирает проект из этого списка: дальше он виден только своей команде, своему менеджеру, тем, у кого на нём есть задача, и тем, кого пустили поимённо на странице настроек проекта. Там же и переключатель.",
        "Того, кто закрывает, в список добавляют автоматически — запереть себя снаружи не выйдет. На закрытом проекте список `@` сужается соответственно: менеджера, который не может открыть проект, там больше не предлагают, потому что вместе с упоминанием уезжает кусок текста.",
        "**Админы его всё равно видят, и страница называет их по именам.** У них база, бэкапы и сброс пароля любому; переключатель, делающий вид, что прячет от них, описывал бы стену, которой нет. Если что-то не должно быть доступно им — этому вообще не место в трекере.",
        "Клиент не заметит ничего: его портал показывает то, что разрешают его собственные переключатели. Закрываются двери студии, а не заказчика.",
      ],
    },
    {
      id: "watching",
      title: "Что следит за вами",
      paragraphs: [
        "Трекер показывает пальцем, а не напоминает обо всём подряд: просроченное, то, что скоро сдавать, работа в статусе «в работе», по которой не списывают часы, забытый таймер, чьё-то упоминание.",
        "Каждая строка — арифметика по датам и часам, которые уже в системе. Ничего не предсказывается, и любую цифру можно проверить по тикету, из которого она взялась. Если строка выглядит неправильной, значит неправильно то, что она описывает.",
        "Студия может включить письмо с тем же списком раз в день. Включено оно или нет — чьё-то решение, а не значение по умолчанию.",
      ],
    },
    {
      id: "managers",
      title: "Если вы ведёте проекты",
      paragraphs: [
        "[Новый проект](/projects/new) можно начать с заявки клиента, с **шаблона** или с нуля. Шаблон приносит тикеты, которые понадобились работе такой формы, — без исполнителей и статусов: работа уйдёт тем, кто окажется в новой команде.",
        "**Команда** проекта набирается человек за человеком. Она решает, кто может открыть проект и кого можно назначить на его тикеты; отделы — это справочник «кто чем занимается», а не правило доступа.",
      ],
      managerParagraphs: [
        "[Workload](/workload) отвечает на вопрос «потянем ли». Остаток часов лежит в той неделе, когда тикет сдаётся; просроченное, недатированное и неоценённое держатся отдельно и в недели не попадают — иначе получился бы выдуманный график.",
        "[Reports](/reports) — там период превращается в строку счёта. По проектам с фиксированной ценой денег за период намеренно нет: часы настоящие, а сумма за месяц была бы придуманной.",
      ],
      insteadForMembers:
        "Workload и Reports тоже есть — для тех, кто ведёт проекты.",
    },
  ],
  outro: {
    title: "Чего на этой странице нет",
    paragraphs: [
      "Как работает *именно эта студия* — как называть ветки, когда выставлять счёт, кто с каким клиентом говорит — это не поведение программы, и здесь ему не место. Напишите это в [Docs](/docs): там вы можете править сами, и там оно лежит рядом с проектами, которые описывает.",
      "Эта страница описывает то, что делает трекер, поэтому она едет вместе с ним и не может протухнуть отдельно.",
    ],
  },
};

export const HELP = { en: HELP_EN, ru: HELP_RU } as const;
export type HelpLang = keyof typeof HELP;

/** `ru` when the browser asks for it first, and English otherwise. */
export function preferredLang(acceptLanguage: string | null): HelpLang {
  if (!acceptLanguage) return "en";
  // Only the first tag matters: somebody whose browser leads with Russian gets
  // Russian, and everybody else gets the project's own language.
  const first = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("ru") ? "ru" : "en";
}
