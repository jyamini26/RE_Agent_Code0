# Trying REAP

A short guide for a first run. No technical background assumed.

## What this is

REAP watches an agent's inbox, works out what each message is asking for, and
drafts a reply. **It never sends anything.** It proposes, you decide, and every
decision is written to a permanent record.

Think of it as an assistant who prepares your work and hands it to you, rather
than software that acts on your behalf.

## Before you start

Everything you will see is **made up**. Sample listings, sample clients, sample
email. Nothing connects to a real inbox, no message goes to a real person, and
no real client information is involved anywhere.

## Starting it

Open the `REAP` folder and double-click **`start-reap.command`** (inside the
`scripts` folder).

A black window opens and prints what it is doing. The first run takes a few
minutes because it installs itself. Later runs take a few seconds. When it is
ready your browser opens automatically.

> **The first time macOS may refuse to open it.** That is the standard warning
> for a file downloaded from the internet. Right-click the file, choose **Open**,
> then click **Open** in the dialog. You only do this once.

**Leave the black window open** while you use REAP. To stop, click that window
and press **Control + C**.

If Node.js is not installed, the window tells you exactly what to download. It
is free and takes about two minutes.

## What to try

Work through it the way you would on a normal morning. There is no wrong order.

**1. The review queue**
Each row is an inbound message. REAP has already decided what kind it is:
an inquiry, a showing request, an offer, a complaint. It shows how confident
it is.

**2. Open one and read "Why this was proposed"**
This is the part worth judging hardest. REAP explains its reasoning before you
approve anything. Ask yourself whether the explanation would let you sign off
in a few seconds, or whether you would still need to reread the original.

**3. Edit the draft reply**
Change the wording to how you would actually say it. Notice how much you had to
change. That gap is the most useful thing you can tell us.

**4. Approve or dismiss**
Approving does **not** send email here. It records the decision.

**5. Open the Ledger**
Every proposal, edit, and approval, in order, permanently. This is what would
let you show a client or a broker exactly what happened and who authorised it.

## What we need to know

Blunt answers are more useful than kind ones. If it wastes your time, that is
the single most valuable thing you can say.

1. **Did the reasoning let you approve quickly**, or did you have to redo the
   thinking yourself?
2. **How much did you rewrite** the drafts? A word, a sentence, all of it?
3. **What did it get wrong?** Wrong category, wrong tone, wrong priority.
4. **What is missing** that you do a dozen times a day and expected to see?
5. **Would you actually open this** on a Tuesday morning, or is it one more
   thing to check?
6. **Where did you get stuck** or have to guess what something meant?

## Things it does not do yet

Worth knowing so you are not looking for them:

- Connect to a real inbox
- Send anything
- Handle more than one user
- Work anywhere except this computer

## If something breaks

Nothing you do here can damage anything. It is sample data on your own machine,
and deleting the `data` folder resets it completely.

If it stops working, a file called `reap.log` appears in the REAP folder. Send
that to Justin.
