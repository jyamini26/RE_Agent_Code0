import type { InboundMessage } from '@reap/shared';

/**
 * Scripted inbound mail for the simulated provider.
 *
 * Chosen to exercise every branch of the classifier and every suggestion
 * template, including the low-confidence path that declines to draft a reply.
 * All names, addresses, and domains are fictional.
 */
export interface Fixture extends Omit<InboundMessage, 'receivedAt'> {
  /** Minutes before "now" that this message arrived. */
  receivedMinutesAgo: number;
  /** Address of the listing this message concerns, matched against seeded data. */
  aboutAddress?: string;
}

export const INBOX_FIXTURES: readonly Fixture[] = [
  {
    // The attack, reproduced faithfully. Note what is *not* wrong with it:
    // the prose is clean, the signature is right, the timing is plausible,
    // and it references a real transaction detail. Nothing in the wording
    // gives it away. The tells are all in the envelope: pacificescrovv.com
    // is not pacificescrow.com, the account differs from the one escrow
    // stated earlier, and it arrives with a deadline attached.
    externalId: 'sim-0008',
    fromName: 'Pacific Coast Escrow',
    fromEmail: 'closer@pacificescrovv.com',
    subject: 'URGENT: Updated wiring instructions for 418 Aldergrove Lane',
    body: `Good morning,

Please note our wiring instructions have been updated as of this morning. Our previous account is no longer receiving funds and any transfer sent there will be returned.

Kindly disregard the instructions sent earlier this week and remit the closing funds to:

  Beneficiary: Pacific Coast Escrow Trust
  Bank: First Meridian National
  Routing: 021000021
  Account: 4471903328

We must receive the wire before close of business today to keep the closing on schedule. Please confirm once sent.

Regards,
Lauren Whitfield
Senior Closing Officer
Pacific Coast Escrow`,
    receivedMinutesAgo: 6,
    aboutAddress: '418 Aldergrove Lane',
  },
  {
    externalId: 'sim-0001',
    fromName: 'Daniel Okafor',
    fromEmail: 'daniel.okafor@example.com',
    subject: 'Questions about 418 Aldergrove Lane',
    body: `Hi,

I saw the listing for 418 Aldergrove Lane and had a few questions before we go further.

What are the HOA dues, and do they cover the roof? Also curious how much the property taxes run, and what the square footage is on the finished basement specifically.

Price seems reasonable for the area but I want to understand the carrying cost.

Thanks,
Daniel`,
    receivedMinutesAgo: 22,
    aboutAddress: '418 Aldergrove Lane',
  },
  {
    externalId: 'sim-0002',
    fromName: 'Priya Raghunathan',
    fromEmail: 'p.raghunathan@example.com',
    subject: 'Relocating in the spring, looking for an agent',
    body: `Hello,

A colleague referred me to you. We are relocating from out of state in the spring and are looking for an agent who knows the north side well.

We are pre-approved up to about 900k, need four bedrooms, and school district matters a lot to us. Thinking of selling our current place around the same time.

Would love to talk.

Priya`,
    receivedMinutesAgo: 95,
  },
  {
    externalId: 'sim-0003',
    fromName: 'Marcus Bell',
    fromEmail: 'marcus.bell@example.com',
    subject: 'Can we tour 2210 Corbin Street this weekend?',
    body: `Hi,

My wife and I would like to see 2210 Corbin Street in person. Are you available to show it this weekend? Saturday works better for us but we are flexible.

Marcus`,
    receivedMinutesAgo: 140,
    aboutAddress: '2210 Corbin Street',
  },
  {
    externalId: 'sim-0004',
    fromName: 'Helena Vasquez',
    fromEmail: 'helena.vasquez@example.com',
    subject: 'Submitting an offer on 418 Aldergrove Lane',
    body: `Good afternoon,

We would like to submit an offer on 418 Aldergrove Lane. Attached is the purchase agreement from our side.

We are offering slightly under asking with a 21-day close and an inspection contingency only. Earnest money is ready to go into escrow today.

Please confirm receipt.

Helena`,
    receivedMinutesAgo: 210,
    aboutAddress: '418 Aldergrove Lane',
  },
  {
    externalId: 'sim-0005',
    fromName: 'Grant Whitmore',
    fromEmail: 'grant.whitmore@example.com',
    subject: 'URGENT - still no update, this is unacceptable',
    body: `I have now asked three times for the inspection report and heard nothing back.

We are eight days from closing and I am completely in the dark. This is unacceptable and frankly I am not happy with how this has been handled.

I need someone to call me today.

Grant`,
    receivedMinutesAgo: 35,
  },
  {
    externalId: 'sim-0006',
    fromName: 'Aisling Byrne',
    fromEmail: 'aisling.byrne@example.com',
    subject: 'Just checking in',
    body: `Hi,

Circling back on our conversation from a couple of weeks ago. Any news on the listing photos or the launch date?

No rush, just wanted a status update when you get a moment.

Thanks,
Aisling`,
    receivedMinutesAgo: 400,
  },
  {
    externalId: 'sim-0007',
    fromName: 'Conference Registrations',
    fromEmail: 'noreply@example.org',
    subject: 'Your badge is ready',
    body: `Your registration is complete. Present this email at the desk.

Reference: 8842-QQ`,
    receivedMinutesAgo: 520,
  },
];
