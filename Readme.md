# is-isodatetime

A Type Validator for ISO Date & Datetime

# Usage

### Validate

```
import { isValidISODateTime } from "is-isodatetime";

isValidISODateTime('2022-09-14T10:22:30.370Z'); // true
isValidISODateTime('asdasd'); // false

```

### Transform

```
import { toISODateTime } from "is-isodatetime";



toISODateTime('2022-09-14T10:22:30.370Z'); // '2022-09-14T10:22:30.370Z'

const now = new Date();
isValidISODateTime(now); // '2022-09-14T10:22:30.370Z'

```

### With [Zod](https://github.com/colinhacks/zod)

```
import { z } from "zod";
import { isValidISODateTime } from "is-isodatetime";

export const isoDatetimeToDate = z
  .string()
  .refine(isValidISODateTime)
  .transform((s) => new Date(s));
```


### With [io-ts](https://github.com/gcanti/io-ts)

```
import * as io from 'io-ts';
import { either } from 'fp-ts/lib/Either';
import { parseISO } from 'date-fns';
import { isValidISODateTime } from "is-isodatetime";

export const isoDateTimeFromIsoString = new io.Type<ISODateTimeType, string, unknown>(
  'ISODateTimeFromISOString',
  (u): u is ISODateTimeType => io.string.is(u) && parseISO(u) instanceof Date,
  (u, c) => either.chain(io.string.validate(u, c), (s) => {
    try {
      return io.success(toISODateTime(s));
    } catch (e) {
      return io.failure(u, c);
    }
  }),
  String,
);
```