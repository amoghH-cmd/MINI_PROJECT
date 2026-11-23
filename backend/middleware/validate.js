// validate({ body, query, params }) with Zod schemas. Parsed (coerced, stripped) values replace the originals.
function validate(schemas) {
  return (req, _res, next) => {
    try {
      for (const part of ['params', 'query', 'body']) {
        if (schemas[part]) {
          const parsed = schemas[part].parse(req[part] ?? {});
          if (part === 'query') req.validatedQuery = parsed; else req[part] = parsed;
        }
      }
      next();
    } catch (err) { next(err); }
  };
}
module.exports = { validate };
