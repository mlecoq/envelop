import { GraphQLError } from 'graphql';
import createSentryTestkit from 'sentry-testkit';
import { useMaskedErrors } from '@envelop/core';
import { useSentry } from '@envelop/sentry';
import { assertSingleExecutionValue, createTestkit } from '@envelop/testing';
import { makeExecutableSchema } from '@graphql-tools/schema';
import * as Sentry from '@sentry/node';
import '@sentry/tracing';

describe('sentry', () => {
  test('report unexpected error', async () => {
    const { testkit: sentryTestkit, sentryTransport } = createSentryTestkit();
    Sentry.init({
      dsn: 'https://public@sentry.example.com/1',
      transport: sentryTransport,
    });

    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: async () => {
            throw new Error('Unexpected Error, ok?');
          },
        },
      },
    });

    const envelopTestkit = createTestkit([useSentry()], schema);
    const result = await envelopTestkit.execute('{ hello }');
    expect(result).toMatchInlineSnapshot(`
      {
        "data": {
          "hello": null,
        },
        "errors": [
          [GraphQLError: Unexpected Error, ok?],
        ],
      }
    `);

    // run sentry flush
    await new Promise(res => setTimeout(res, 10));

    const reports = sentryTestkit.reports();
    expect(reports).toHaveLength(1);
    expect(reports[0].error).toMatchObject({
      message: 'Unexpected Error, ok?',
      name: 'Error',
    });
  });

  test('skip reporting expected error', async () => {
    const { testkit: sentryTestkit, sentryTransport } = createSentryTestkit();
    Sentry.init({
      dsn: 'https://public@sentry.example.com/1',
      transport: sentryTransport,
    });

    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => {
            throw new GraphQLError('Expected Error, ok?');
          },
        },
      },
    });
    const envelopTestkit = createTestkit([useSentry()], schema);
    const result = await envelopTestkit.execute('{ hello }');

    expect(result).toMatchInlineSnapshot(`
      {
        "data": {
          "hello": null,
        },
        "errors": [
          [GraphQLError: Expected Error, ok?],
        ],
      }
    `);

    // run sentry flush
    await new Promise(res => setTimeout(res, 10));

    expect(sentryTestkit.reports()).toHaveLength(0);
  });

  test('report unexpected error with masking', async () => {
    const { testkit: sentryTestkit, sentryTransport } = createSentryTestkit();
    Sentry.init({
      dsn: 'https://public@sentry.example.com/1',
      transport: sentryTransport,
    });

    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: async () => {
            throw new Error('Unexpected Error, ok?');
          },
        },
      },
    });

    const envelopTestkit = createTestkit([useSentry(), useMaskedErrors()], schema);
    const result = await envelopTestkit.execute('{ hello }');
    expect(result).toMatchInlineSnapshot(`
      {
        "data": {
          "hello": null,
        },
        "errors": [
          [GraphQLError: Unexpected error.],
        ],
      }
    `);

    // run sentry flush
    await new Promise(res => setTimeout(res, 10));

    const reports = sentryTestkit.reports();
    expect(reports).toHaveLength(1);
    expect(reports[0].error).toMatchObject({
      message: 'Unexpected Error, ok?',
      name: 'Error',
    });
  });

  test('skip reporting expected error with error masking', async () => {
    const { testkit: sentryTestkit, sentryTransport } = createSentryTestkit();
    Sentry.init({
      dsn: 'https://public@sentry.example.com/1',
      transport: sentryTransport,
    });

    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => {
            throw new GraphQLError('Expected Error, ok?');
          },
        },
      },
    });
    const envelopTestkit = createTestkit([useSentry(), useMaskedErrors()], schema);
    const result = await envelopTestkit.execute('{ hello }');

    expect(result).toMatchInlineSnapshot(`
      {
        "data": {
          "hello": null,
        },
        "errors": [
          [GraphQLError: Expected Error, ok?],
        ],
      }
    `);

    // run sentry flush
    await new Promise(res => setTimeout(res, 10));

    expect(sentryTestkit.reports()).toHaveLength(0);
  });

  test('attaches event id to error', async () => {
    const { sentryTransport } = createSentryTestkit();
    Sentry.init({
      dsn: 'https://public@sentry.example.com/1',
      transport: sentryTransport,
    });

    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => {
            throw new Error('Unexpected Error, ok?');
          },
        },
      },
    });
    const envelopTestkit = createTestkit([useSentry()], schema);
    const result = await envelopTestkit.execute('{ hello }');

    assertSingleExecutionValue(result);

    expect(result.errors?.[0].extensions).toEqual({
      sentryEventId: expect.any(String),
    });
  });

  test('reports runtime error', async () => {
    const { testkit: sentryTestkit, sentryTransport } = createSentryTestkit();
    Sentry.init({
      dsn: 'https://public@sentry.example.com/1',
      transport: sentryTransport,
    });

    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String!
        }
      `,
      resolvers: {
        Query: {
          hello: async () => {
            return null;
          },
        },
      },
    });

    const envelopTestkit = createTestkit([useSentry()], schema);
    const result = await envelopTestkit.execute('{ hello }');
    expect(result).toMatchInlineSnapshot(`
      {
        "data": null,
        "errors": [
          [GraphQLError: Cannot return null for non-nullable field Query.hello.],
        ],
      }
    `);

    // run sentry flush
    await new Promise(res => setTimeout(res, 10));

    const reports = sentryTestkit.reports();
    expect(reports).toHaveLength(1);
    expect(reports[0].error).toMatchObject({
      message: 'Cannot return null for non-nullable field Query.hello.',
      name: 'Error',
    });
  });
});
