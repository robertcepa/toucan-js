import { describe, expect, it, test } from '@jest/globals';
import { z } from 'zod';

import {
  flattenIssue,
  flattenIssuePath,
  formatIssueMessage,
} from './zoderrors';

describe('flattenIssue()', () => {
  it('flattens path field', () => {
    const zodError = z
      .object({
        foo: z.string().min(1),
        nested: z.object({
          bar: z.literal('baz'),
        }),
      })
      .safeParse({
        foo: '',
        nested: {
          bar: 'not-baz',
        },
      }).error;
    if (zodError === undefined) {
      throw new Error('zodError is undefined');
    }

    // Original zod error
    expect(zodError.issues).toMatchInlineSnapshot(`
			[
			  {
			    "code": "too_small",
			    "exact": false,
			    "inclusive": true,
			    "message": "String must contain at least 1 character(s)",
			    "minimum": 1,
			    "path": [
			      "foo",
			    ],
			    "type": "string",
			  },
			  {
			    "code": "invalid_literal",
			    "expected": "baz",
			    "message": "Invalid literal value, expected "baz"",
			    "path": [
			      "nested",
			      "bar",
			    ],
			    "received": "not-baz",
			  },
			]
		`);

    const issues = zodError.issues;
    expect(issues.length).toBe(2);

    // Format it for use in Sentry
    expect(issues.map(flattenIssue)).toMatchInlineSnapshot(`
			[
			  {
			    "code": "too_small",
			    "exact": false,
			    "inclusive": true,
			    "keys": undefined,
			    "message": "String must contain at least 1 character(s)",
			    "minimum": 1,
			    "path": "foo",
			    "type": "string",
			    "unionErrors": undefined,
			  },
			  {
			    "code": "invalid_literal",
			    "expected": "baz",
			    "keys": undefined,
			    "message": "Invalid literal value, expected "baz"",
			    "path": "nested.bar",
			    "received": "not-baz",
			    "unionErrors": undefined,
			  },
			]
		`);
  });

  it('flattens keys field to string', () => {
    const zodError = z
      .object({
        foo: z.string().min(1),
      })
      .strict()
      .safeParse({
        foo: 'bar',
        extra_key_abc: 'hello',
        extra_key_def: 'world',
      }).error;
    if (zodError === undefined) {
      throw new Error('zodError is undefined');
    }

    // Original zod error
    expect(zodError.issues).toMatchInlineSnapshot(`
			[
			  {
			    "code": "unrecognized_keys",
			    "keys": [
			      "extra_key_abc",
			      "extra_key_def",
			    ],
			    "message": "Unrecognized key(s) in object: 'extra_key_abc', 'extra_key_def'",
			    "path": [],
			  },
			]
		`);

    const issues = zodError.issues;
    expect(issues.length).toBe(1);

    // Format it for use in Sentry
    const formattedIssue = flattenIssue(issues[0]);

    // keys is now a string rather than array.
    // Note: path is an empty string because the issue is at the root.
    // TODO: Maybe somehow make it clearer that this is at the root?
    expect(formattedIssue).toMatchInlineSnapshot(`
			{
			  "code": "unrecognized_keys",
			  "keys": "["extra_key_abc","extra_key_def"]",
			  "message": "Unrecognized key(s) in object: 'extra_key_abc', 'extra_key_def'",
			  "path": "",
			  "unionErrors": undefined,
			}
		`);
    expect(typeof formattedIssue.keys === 'string').toBe(true);
  });
});

describe('flattenIssuePath()', () => {
  it('returns single path', () => {
    expect(flattenIssuePath(['foo'])).toBe('foo');
  });

  it('flattens nested string paths', () => {
    expect(flattenIssuePath(['foo', 'bar'])).toBe('foo.bar');
  });

  it('uses placeholder for path index within array', () => {
    expect(flattenIssuePath([0, 'foo', 1, 'bar'])).toBe(
      '<array>.foo.<array>.bar',
    );
  });
});

describe('formatIssueMessage()', () => {
  it('adds invalid keys to message', () => {
    const zodError = z
      .object({
        foo: z.string().min(1),
        nested: z.object({
          bar: z.literal('baz'),
        }),
      })
      .safeParse({
        foo: '',
        nested: {
          bar: 'not-baz',
        },
      }).error;
    if (zodError === undefined) {
      throw new Error('zodError is undefined');
    }

    const message = formatIssueMessage(zodError);
    expect(message).toMatchInlineSnapshot(
      `"Failed to validate keys: foo, nested.bar"`,
    );
  });

  describe('adds expected type if root variable is invalid', () => {
    test('object', () => {
      const zodError = z
        .object({
          foo: z.string().min(1),
        })
        .safeParse(123).error;
      if (zodError === undefined) {
        throw new Error('zodError is undefined');
      }

      // Original zod error
      expect(zodError.issues).toMatchInlineSnapshot(`
				[
				  {
				    "code": "invalid_type",
				    "expected": "object",
				    "message": "Expected object, received number",
				    "path": [],
				    "received": "number",
				  },
				]
			`);

      const message = formatIssueMessage(zodError);
      expect(message).toMatchInlineSnapshot(`"Failed to validate object"`);
    });

    test('number', () => {
      const zodError = z.number().safeParse('123').error;
      if (zodError === undefined) {
        throw new Error('zodError is undefined');
      }

      // Original zod error
      expect(zodError.issues).toMatchInlineSnapshot(`
				[
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "message": "Expected number, received string",
				    "path": [],
				    "received": "string",
				  },
				]
			`);

      const message = formatIssueMessage(zodError);
      expect(message).toMatchInlineSnapshot(`"Failed to validate number"`);
    });

    test('string', () => {
      const zodError = z.string().safeParse(123).error;
      if (zodError === undefined) {
        throw new Error('zodError is undefined');
      }

      // Original zod error
      expect(zodError.issues).toMatchInlineSnapshot(`
				[
				  {
				    "code": "invalid_type",
				    "expected": "string",
				    "message": "Expected string, received number",
				    "path": [],
				    "received": "number",
				  },
				]
			`);

      const message = formatIssueMessage(zodError);
      expect(message).toMatchInlineSnapshot(`"Failed to validate string"`);
    });

    test('array', () => {
      const zodError = z.string().array().safeParse('123').error;
      if (zodError === undefined) {
        throw new Error('zodError is undefined');
      }

      // Original zod error
      expect(zodError.issues).toMatchInlineSnapshot(`
				[
				  {
				    "code": "invalid_type",
				    "expected": "array",
				    "message": "Expected array, received string",
				    "path": [],
				    "received": "string",
				  },
				]
			`);

      const message = formatIssueMessage(zodError);
      expect(message).toMatchInlineSnapshot(`"Failed to validate array"`);
    });

    test('wrong type in array', () => {
      const zodError = z.string().array().safeParse([123]).error;
      if (zodError === undefined) {
        throw new Error('zodError is undefined');
      }

      // Original zod error
      expect(zodError.issues).toMatchInlineSnapshot(`
				[
				  {
				    "code": "invalid_type",
				    "expected": "string",
				    "message": "Expected string, received number",
				    "path": [
				      0,
				    ],
				    "received": "number",
				  },
				]
			`);

      const message = formatIssueMessage(zodError);
      expect(message).toMatchInlineSnapshot(
        `"Failed to validate keys: <array>"`,
      );
    });
  });
});
