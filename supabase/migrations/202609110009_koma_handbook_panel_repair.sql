-- Repair the active handbook presentation after the KOMA://PLAY rebrand.
-- The conduct compact remains compact-v1, so existing acceptance is bridged
-- explicitly and audibly rather than weakening the handbook gate.
do $repair$
declare
  previous_version uuid;
  replacement_version uuid;
  administrator_id uuid;
begin
  select id into previous_version
  from public.handbook_versions
  where identifier = 'handbook-2026-09-v1'
  for update;
  if previous_version is null then
    raise exception 'Expected legacy handbook version was not found';
  end if;

  select id into administrator_id
  from public.profiles
  where role = 'admin' and account_status = 'active'
  order by created_at
  limit 1;
  if administrator_id is null then
    raise exception 'An active administrator profile is required to audit the handbook compatibility bridge';
  end if;

  insert into public.handbook_versions(
    identifier,label,content,acceptance_statement,statement_version,active,created_by
  ) values (
    'handbook-2026-09-koma-v1',
    $label$Community handbook · KOMA presentation · Version 1$label$,
    $content$# WELCOME TO KOMA://PLAY

A human-edited home for games, anime, manga and the culture surrounding them.

This is a place to read deeply, share what you know and help create something worth keeping.

## THE PANEL

Every feature begins with an editorial point of view.

While its Open Panel is active, the community can add:

* knowledge;
* experience;
* corrections;
* sources;
* screenshots;
* strategies;
* thoughtful disagreement;
* genuinely useful questions.

The strongest contributions become part of the finished article, with credit.

You are not posting beneath the work.

**You are helping build it.**

## HOW WE MOVE

### Bring something to the panel

Curiosity is enough to begin. Experience, evidence and thoughtful questions make the work stronger.

### Critique ideas, not people

Disagreement belongs here. Hostility, humiliation and pile-ons do not.

### Credit the source

Artists, writers, players and contributors deserve attribution. Say where material came from and never present somebody else’s work as your own.

### Enthusiasm is not embarrassing

People are allowed to care deeply about the things they love. Sincerity is welcome here.

### Expertise is for sharing

Knowing more does not make someone more important. Help newcomers enter the conversation.

### Be human

Do not impersonate people, manufacture support or use automated accounts to imitate community participation. Disclose meaningful use of generated material.

### Leave the panel better

Before submitting, ask:

> Does this add knowledge, clarity, perspective or joy?

## WHAT KOMA://PLAY PROMISES

We will not build the community around:

* rage-driven recommendations;
* infinite scrolling;
* public popularity contests;
* purchased influence;
* covert advertising;
* uncredited generated content;
* selling behavioural data;
* deliberately addictive engagement tricks.

Moderation decisions will be made by accountable people. Contributors can ask for explanations and appeal significant decisions.

## THE PUBLISHING RHYTHM

New panels arrive every week.

Weekly drops become a monthly issue.

Open Panels close when the issue ends.

The final edition enters the archive with its revisions and contributors preserved.

**Discord is where we talk.
KOMA://PLAY is where we remember.**

## PROTECT THE SPACE

Do not share another person’s private information.

Do not pressure anyone into private conversations.

Do not post harassment, hate, sexualised material involving young people, threats or exploitative content.

Report anything that makes the community unsafe. Asking for help will never count against you.

## YOUR MARK

KOMA://PLAY does not measure people by follower counts or how loudly they post.

Contribution is recognised through the work:

* Founding Panelist
* Published Contributor
* Guide Builder
* Source Finder
* Archivist
* Panel Editor

The goal is not to win the conversation.

It is to create an issue we are proud to put our names on.

# LEAVE THE PANEL BETTER THAN YOU FOUND IT.
$content$,
    $compact$I will treat people with respect, credit the work of others, disclose generated material and leave each panel better than I found it.$compact$,
    'compact-v1',
    false,
    administrator_id
  )
  on conflict (identifier) do update
    set label=excluded.label,
        content=excluded.content,
        acceptance_statement=excluded.acceptance_statement,
        statement_version=excluded.statement_version,
        updated_at=now()
  returning id into replacement_version;

  perform pg_advisory_xact_lock(188504, 1);
  update public.handbook_versions set active=false, updated_at=now() where active and id<>replacement_version;
  update public.handbook_versions set active=true, updated_at=now() where id=replacement_version;

  insert into public.handbook_acceptance_compatibilities(
    from_version_id,to_version_id,reason,created_by
  ) values (
    previous_version,replacement_version,
    'KOMA://PLAY presentation rebrand; the compact-v1 conduct statement is unchanged.',
    administrator_id
  ) on conflict (from_version_id,to_version_id) do nothing;

  insert into public.handbook_version_audit(version_id,actor_id,action)
  values (replacement_version,administrator_id,'Activated KOMA presentation with compact-v1 compatibility bridge');
end
$repair$;
