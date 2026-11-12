/**
 * terms.ts — the Terms and Conditions text and the credit line. One place, so
 * the start-up pop-up, the footer and the README cannot drift apart.
 *
 * Bump TERMS_VERSION whenever the wording changes: everyone is then asked to
 * agree again. No Node-only imports — this runs in the browser.
 */
export const AUTHOR = 'Kayomarz Pavri';
export const APP_NAME = 'Mailer';
export const TERMS_VERSION = '2026-11-12';
export const COPYRIGHT_YEAR = 2026;

export interface TermsSection { title: string; paragraphs: string[] }

export const TERMS_INTRO =
  `These Terms and Conditions ("Terms") are a legal agreement between you ("User") and ${AUTHOR} ("Licensor", "Author"), ` +
  `the individual who created and owns ${APP_NAME} (the "Software"). Please read them carefully. By pressing "I Agree" you confirm ` +
  `that you have read, understood and accepted these Terms. If you do not agree, do not use the Software.`;

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: '1. Acceptance of the Terms',
    paragraphs: [
      'Pressing "I Agree" is a clear, affirmative act of acceptance and has the same effect as signing this agreement. You may use the Software only after accepting these Terms.',
      'You confirm that you are at least 18 years old (or the age of majority where you live) and are allowed to enter into this agreement. If you use the Software on behalf of an organisation, you confirm that you are authorised to bind that organisation to these Terms.',
    ],
  },
  {
    title: '2. Licence',
    paragraphs: [
      'The Licensor grants you a limited, non-exclusive, non-transferable, revocable licence to install and run the Software on your own computer for your own lawful purposes.',
      'You may not sell, rent, sublicense or distribute the Software, remove or alter any copyright or credit notice, or present the Software as your own work, except as the Licensor allows in writing.',
    ],
  },
  {
    title: '3. Ownership and credit',
    paragraphs: [
      `The Software, including its design, source code and documentation, was created and developed by ${AUTHOR}, who owns all rights in it and is entitled to full credit for it. ` +
      'The Software is the work of an individual author and is not made, sponsored or endorsed by any university, school, employer or other institution.',
      'Third-party components included in the Software remain the property of their respective owners and are used under their own licences.',
    ],
  },
  {
    title: '4. Acceptable use',
    paragraphs: [
      'You are solely responsible for everything you do with the Software, including every e-mail you write and every message sent from your accounts. You agree to use it only for lawful purposes and in line with the rules of your mail provider.',
      'You must not use the Software to: send unsolicited bulk e-mail ("spam"); send messages to people who have not agreed to receive them where the law requires that they have; phish, defraud, deceive, harass, threaten or defame anyone; impersonate another person or organisation; spread malware; infringe anyone\'s copyright, trademark, privacy or other rights; or break any law or regulation that applies to you or to your recipients.',
      'Laws on e-mail marketing and personal data differ by country (for example CAN-SPAM in the United States, GDPR and the ePrivacy rules in Europe, CASL in Canada and the IT Act in India). Finding out which laws apply to you, getting any consent they require, honouring unsubscribe requests and keeping your recipient lists lawful is entirely your responsibility.',
    ],
  },
  {
    title: '5. Your accounts, data and content',
    paragraphs: [
      'The Software runs on your computer. Your mail account details, recipient lists, messages and history are stored on your computer, and messages are sent through the mail account you connect. The Licensor does not receive, see or store any of it.',
      'You are responsible for keeping your credentials, your computer and the Software\'s data folder secure, for backing up anything you need, and for the content you send. Your mail provider may suspend or close your account if you break its rules; the Licensor has no control over that.',
    ],
  },
  {
    title: '6. Misuse — release and waiver of liability',
    paragraphs: [
      'The Licensor does not control how the Software is used and does not monitor, approve or endorse any message sent with it. TO THE FULLEST EXTENT PERMITTED BY LAW, THE LICENSOR WAIVES AND DISCLAIMS ALL LIABILITY FOR ANY MISUSE OF THE SOFTWARE, whether by you or by anyone who uses your computer, accounts or copy of the Software, and whether the misuse is unlawful, negligent, careless or intentional.',
      'This includes, without limitation, spam, phishing, fraud, harassment, defamation, breach of privacy or data-protection law, infringement of intellectual property, and any complaint, claim, fine, penalty, blocklisting, account suspension or other consequence that results from the messages you send.',
      'You release the Licensor from every claim, demand and cause of action arising out of or connected with your use or misuse of the Software, and you agree that the person who misuses the Software, and not the Licensor, is responsible for the consequences.',
    ],
  },
  {
    title: '7. No warranty',
    paragraphs: [
      'THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, NON-INFRINGEMENT AND UNINTERRUPTED OR ERROR-FREE OPERATION.',
      'A message shown as "Sent" means only that the mail server accepted it. The Licensor does not promise that any message will be delivered, reach an inbox rather than a spam folder, be read, or be sent only once, or that the Software is free of bugs.',
    ],
  },
  {
    title: '8. Limitation of liability',
    paragraphs: [
      'TO THE FULLEST EXTENT PERMITTED BY LAW, THE LICENSOR SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, BUSINESS, GOODWILL, REPUTATION OR DATA, ARISING OUT OF OR RELATED TO THE SOFTWARE OR THESE TERMS, HOWEVER CAUSED AND UNDER ANY THEORY OF LIABILITY, EVEN IF THE LICENSOR HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.',
      'Because the Software is provided free of charge, if liability cannot be excluded in full, the Licensor\'s total liability to you for all claims is limited to the amount you paid for the Software, which is zero.',
      'Some places do not allow certain exclusions or limits. In those places the exclusions and limits above apply only as far as the law permits, and nothing in these Terms limits a liability that cannot lawfully be limited.',
    ],
  },
  {
    title: '9. Indemnification',
    paragraphs: [
      `You agree to defend, indemnify and hold harmless ${AUTHOR} from and against any claims, damages, losses, liabilities, penalties, costs and expenses (including reasonable legal fees) arising out of your use or misuse of the Software, the content of your messages, your breach of these Terms, or your breach of any law or third-party right.`,
    ],
  },
  {
    title: '10. Termination',
    paragraphs: [
      'These Terms apply for as long as you use the Software. The Licensor may end your licence at any time if you break these Terms. You may end it at any time by uninstalling the Software and deleting its data. Sections 3 and 5 to 12 continue to apply after termination.',
    ],
  },
  {
    title: '11. Changes to the Software and to these Terms',
    paragraphs: [
      'The Licensor may change, suspend or stop the Software, and may update these Terms. When the Terms change, you will be asked to read and accept the new version before you carry on using the Software.',
    ],
  },
  {
    title: '12. General',
    paragraphs: [
      'These Terms are the entire agreement between you and the Licensor about the Software and replace any earlier understanding. If any part is found unenforceable, the rest stays in force. A failure to enforce a right is not a waiver of it. You may not transfer your rights under these Terms to anyone else.',
      'These Terms are governed by the laws that apply where the Licensor lives, and any dispute will be dealt with by the courts there, unless the law of your country gives you a right to a different forum that cannot be waived.',
    ],
  },
];

export const CREDIT_LINE = `© ${COPYRIGHT_YEAR} ${AUTHOR}. All rights reserved.`;

/** The whole text as Markdown — used to generate TERMS.md. */
export function termsAsMarkdown(): string {
  return [
    `# ${APP_NAME} — Terms and Conditions`,
    '',
    `Version ${TERMS_VERSION}`,
    '',
    TERMS_INTRO,
    '',
    ...TERMS_SECTIONS.flatMap((s) => [`## ${s.title}`, '', ...s.paragraphs.flatMap((p) => [p, ''])]),
    '---',
    '',
    `${CREDIT_LINE} Created and developed by ${AUTHOR}.`,
    '',
  ].join('\n');
}
