const { default: Ajv } = require('ajv/dist/2020');
const defineAjvKeywords = require('ajv-keywords');

const ValidationResult = require('./ValidationResult');

const JsonSchemaValidationError = require('./errors/JsonSchemaValidationError');
const ConflictingConditionsError = require('./errors/ConflictingConditionsError');

const jsonSchema = require('./jsonSchema');

const NotIndexedPropertiesInWhereConditionsError = require('./errors/NotIndexedPropertiesInWhereConditionsError');
const MultipleRangeOperatorsError = require('./errors/MultipleRangeOperatorsError');
const InOperatorAllowedOnlyForLastTwoIndexedPropertiesError = require('./errors/InOperatorAllowedOnlyForLastTwoIndexedPropertiesError');
const RangeOperatorAllowedOnlyWithEqualOperatorsError = require('./errors/RangeOperatorAllowedOnlyWithEqualOperatorsError');
const RangePropertyDoesNotHaveOrderByError = require('./errors/RangePropertyDoesNotHaveOrderByError');
const RangeOperatorAllowedOnlyForLastTwoWhereConditionsError = require('./errors/RangeOperatorAllowedOnlyForLastTwoWhereConditionsError');
const WhereConditionPropertiesNumberError = require('./errors/WhereConditionPropertiesNumberError');
const OrderByWithoutWhereConditionsError = require('./errors/OrderByWithoutWhereConditionsError');
const QueriedPropertyIsToFarAwayError = require('./errors/QueriedPropertyIsToFarAwayError');
const InvalidPropertiesInOrderByError = require('./errors/InvalidPropertiesInOrderByError');
const InvalidOrderByPropertiesOrderError = require('./errors/InvalidOrderByPropertiesOrderError');

/**
 * @param {findConflictingConditions} findConflictingConditions
 * @param {findAppropriateIndex} findAppropriateIndex
 * @param {sortWhereClausesAccordingToIndex} sortWhereClausesAccordingToIndex
 * @param {findThreesomeOfIndexedProperties} findThreesomeOfIndexedProperties
 * @param {findIndexedPropertiesSince} findIndexedPropertiesSince
 *
 * @return {validateQuery}
 */
function validateQueryFactory(
  findConflictingConditions,
  findAppropriateIndex,
  sortWhereClausesAccordingToIndex,
  findThreesomeOfIndexedProperties,
  findIndexedPropertiesSince,
) {
  const ajv = defineAjvKeywords(new Ajv({
    strictTypes: true,
    strictTuples: true,
    strictRequired: true,
    addUsedSchema: false,
    strict: true,
  }), ['instanceof']);

  const validateWithJsonSchema = ajv.compile(jsonSchema);

  /**
   * Validate fetchDocuments query
   *
   * @typedef validateQuery
   * @param {Object} query
   * @param {Object} documentSchema
   * @return {ValidationResult}
   */
  function validateQuery(query, documentSchema) {
    const result = new ValidationResult();

    const isValid = validateWithJsonSchema(query);

    if (!isValid) {
      return result.addError(
        ...validateWithJsonSchema.errors.map((e) => new JsonSchemaValidationError(e)),
      );
    }

    let sortedWhereClauses = [];
    let appropriateIndex;

    // Where conditions must follow document indices
    if (query.where) {
      // Find conflicting conditions
      result.addError(
        ...findConflictingConditions(query.where)
          .map(([field, operators]) => new ConflictingConditionsError(field, operators)),
      );

      appropriateIndex = findAppropriateIndex(query.where, documentSchema);

      if (appropriateIndex === undefined) {
        result.addError(new NotIndexedPropertiesInWhereConditionsError());

        return result;
      }

      sortedWhereClauses = sortWhereClausesAccordingToIndex(query.where, appropriateIndex);

      // check following operators are used only in last 2 where condition
      // eslint-disable-next-line consistent-return
      ['>', '<', '>=', '<='].forEach((operator) => {
        const invalidClause = sortedWhereClauses.find((clause, index) => (
          clause[1] === operator
          && (index !== sortedWhereClauses.length - 1 && index !== sortedWhereClauses.length - 2)
        ));

        if (invalidClause) {
          result.addError(
            new RangeOperatorAllowedOnlyForLastTwoWhereConditionsError(),
          );

          return result;
        }
      });

      // check we have only one range in query
      const rangeOperators = ['>', '<', '>=', '<=', 'startsWith'];

      const propertyRangeOperatorMap = {};

      let anotherRangeOperatorSet = false;
      for (const [property, operator] of sortedWhereClauses) {
        if (propertyRangeOperatorMap[property] === undefined && rangeOperators.includes(operator)) {
          propertyRangeOperatorMap[property] = 1;

          if (anotherRangeOperatorSet) {
            result.addError(
              new MultipleRangeOperatorsError(property, operator),
            );

            return result;
          }

          anotherRangeOperatorSet = true;

          continue;
        }

        if (rangeOperators.includes(operator)) {
          propertyRangeOperatorMap[property] += 1;
        }

        if (propertyRangeOperatorMap[property] > 2) {
          result.addError(
            new MultipleRangeOperatorsError(property, operator),
          );

          return result;
        }
      }

      // check 'in' is used only in the last two indexed conditions
      const invalidClause = sortedWhereClauses.find((clause) => {
        let clauseIsInvalid = false;
        if (clause[1] === 'in') {
          clauseIsInvalid = appropriateIndex.properties.find((indexObj, index) => {
            const [indexProperty] = Object.keys(indexObj)[0];

            return indexProperty === clause[0]
              && index !== appropriateIndex.properties.length - 1
              && index !== appropriateIndex.properties.length - 2;
          });
        }

        return clauseIsInvalid;
      });

      if (invalidClause) {
        result.addError(
          new InOperatorAllowedOnlyForLastTwoIndexedPropertiesError(invalidClause[0], 'in'),
        );

        return result;
      }

      // check range operators are used after '==' and 'in'
      let lastPrefixOperatorIndex;
      sortedWhereClauses.forEach((clause, index) => {
        if ((clause[1] === '==' || clause[1] === 'in')) {
          lastPrefixOperatorIndex = index;
        }
      });

      // eslint-disable-next-line consistent-return
      sortedWhereClauses.forEach((clause, index) => {
        if (rangeOperators.includes(clause[1]) && index < lastPrefixOperatorIndex) {
          result.addError(
            new RangeOperatorAllowedOnlyWithEqualOperatorsError(clause[0], clause[1]),
          );

          return result;
        }
      });

      // check 'in' or range operators are in orderBy
      // eslint-disable-next-line consistent-return
      sortedWhereClauses.forEach((clause) => {
        if (['>', '<', '>=', '<=', 'startsWith', 'in'].includes(clause[1])) {
          const hasOrderBy = (query.orderBy || [])
            .find(([orderByProperty]) => orderByProperty === clause[0]);

          if (!hasOrderBy) {
            result.addError(
              new RangePropertyDoesNotHaveOrderByError(clause[0], clause[1]),
            );

            return result;
          }
        }
      });

      if (sortedWhereClauses.length < appropriateIndex.properties.length - 2) {
        result.addError(
          new WhereConditionPropertiesNumberError(appropriateIndex.properties.length - 2),
        );

        return result;
      }
    }

    // Sorting is allowed only for the last indexed property
    if (query.orderBy) {
      if (!query.where) {
        result.addError(new OrderByWithoutWhereConditionsError());

        return result;
      }

      // check that property was used with range operator + 'in'
      let lastInRangeOrIn;
      for (const [orderByProperty] of query.orderBy) {
        const foundInRangeOrIn = sortedWhereClauses.find((whereClause) => (
          whereClause[0] === orderByProperty && ['>', '<', '>=', '<=', 'startsWith', 'in'].includes(whereClause[1])
        ));

        if (foundInRangeOrIn) {
          [lastInRangeOrIn] = foundInRangeOrIn;

          // everything is fine, going next
          continue;
        }

        // not in a range, but there was a match before
        if (!foundInRangeOrIn && lastInRangeOrIn) {
          // check that this property is within 2 positions from the previous match
          const foundIndexList = findThreesomeOfIndexedProperties(
            lastInRangeOrIn, documentSchema,
          );

          if (!foundIndexList.find((indices) => indices.includes(orderByProperty))) {
            result.addError(
              new QueriedPropertyIsToFarAwayError(orderByProperty),
            );

            return result;
          }
        }

        // not in a range and there were no previous matches
        if (!foundInRangeOrIn && !lastInRangeOrIn) {
          result.addError(new InvalidPropertiesInOrderByError(orderByProperty));

          return result;
        }
      }

      const firstOrderByProperty = query.orderBy[0][0];

      const foundIndexPropertyLists = findIndexedPropertiesSince(
        firstOrderByProperty, query.orderBy.length, documentSchema,
      );

      const orderByPropertiesString = query.orderBy.reduce((s, [prop]) => s.concat(prop), '');

      const orderMatch = foundIndexPropertyLists.find((propertyList) => {
        const propertyListString = propertyList.reduce(
          (s, prop) => s.concat(prop), '',
        );

        return propertyListString === orderByPropertiesString;
      });

      if (!orderMatch) {
        result.addError(
          new InvalidOrderByPropertiesOrderError(),
        );
      }
    }

    return result;
  }

  return validateQuery;
}

module.exports = validateQueryFactory;
