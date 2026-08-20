'use strict';
const AppError = require('../utils/AppError');

/**
 * Factory that returns an Express middleware validating the specified
 * parts of the request against a Joi schema object.
 *
 * @param {{ body?: Joi.Schema, query?: Joi.Schema, params?: Joi.Schema }} schemas
 *
 * Usage:
 *   router.post('/meetings', validate({ body: meetingSchemas.create }), handler);
 */
function validate(schemas) {
  return (req, res, next) => {
    const parts = ['body', 'query', 'params'];

    for (const part of parts) {
      if (!schemas[part]) continue;

      const { error, value } = schemas[part].validate(req[part], {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      });

      if (error) {
        const message = error.details.map((d) => d.message).join('; ');
        return next(new AppError(message, 400));
      }

      req[part] = value; // replace with coerced / stripped values
    }

    next();
  };
}

module.exports = validate;
