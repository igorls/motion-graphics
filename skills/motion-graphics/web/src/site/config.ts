// Everything about where the site lives and where messages go, in one place.
export const site = {
  name: 'Brand',
  origin: 'https://example.com',
  email: { hello: 'hello@example.com' },
  /** Sign-ups: a URL that accepts a form POST (email, lang) and answers 2xx; empty = open a mail to `email.hello`. */
  signup: { endpoint: '' as string },
};
