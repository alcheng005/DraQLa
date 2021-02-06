const toCamelCase = require('camelcase');
const { singular } = require('pluralize');
const { pascalCase } = require('pascal-case');
const mutationHelper = {};
const customHelper = {};

const typeSet = (str) => {
  switch (str) {
    case 'character varying':
      return 'String';
    case 'character':
      return 'String';
    case 'integer':
      return 'Int';
    case 'text':
      return 'String';
    case 'date':
      return 'String';
    case 'boolean':
      return 'Boolean';
    default:
      return 'Int';
  }
};


mutationHelper.create = (tableName, primaryKey, foreignKeys, columns) => {
  return `\n    ${toCamelCase(
    `create_${singular(tableName)}`
  )}(\n${mutationHelper.paramType(
    primaryKey,
    foreignKeys,
    columns,
    false
  )}): ${pascalCase(singular(tableName))}!\n`;
};

mutationHelper.update = (tableName, primaryKey, foreignKeys, columns) => {
  return `\n    ${toCamelCase(
    `update_${singular(tableName)}`
  )}(\n${mutationHelper.paramType(
    primaryKey,
    foreignKeys,
    columns,
    true
  )}): ${pascalCase(singular(tableName))}!\n`;
};

mutationHelper.destroy = (tableName, primaryKey) => {
  return `\n    ${toCamelCase(
    `delete_${singular(tableName)}`
  )}(${primaryKey}: ID!): ${pascalCase(singular(tableName))}!\n`;
};

mutationHelper.paramType = (primaryKey, foreignKeys, columns, isRequired) => {
  let typeDef = '';
  for (const columnName in columns) {
    const { dataType, isNullable } = columns[columnName];
    if (!isRequired && columnName === primaryKey) {
      continue; // when creating a new SQL ROW, primary keys are autoincrement (serial) so we don't need them in the create statement
    }

    if (isRequired && columnName === primaryKey) {
      typeDef += `      ${columnName}: ${typeSet(dataType)}!,\n`;
    } else {
      typeDef += `      ${columnName}: ${typeSet(dataType)}`;
      if (isNullable !== 'YES') typeDef += '!';
      typeDef += ',\n';
    }
  }
  if (typeDef !== '') typeDef += '    ';
  return typeDef;
};

const isJoinTable = (foreignKeys, columns) => {
  return Object.keys(columns).length === Object.keys(foreignKeys).length + 1;
};



customHelper.getColumns = (primaryKey, foreignKeys, columns) => {
  let columnsStr = '';
  //building columns: type for eatch table in a column
  for (const columnName in columns) {
    if (!(foreignKeys && foreignKeys[columnName]) && columnName !== primaryKey) {
      const { dataType, isNullable, columnDefault } = columns[columnName];
      columnsStr += `\n    ${columnName}: ${typeSet(dataType)}`;
      if (isNullable === 'NO' && columnDefault === null) columnsStr += '!';
    }
  }
  console.log('colstr', columnsStr)
  return columnsStr;
};



customHelper.getRelationships = (tableName, tables) => {
  let relationships = '';
  const alreadyAddedType = [];
  for (const refTableName in tables[tableName].referencedBy) {

    const { referencedBy: foreignRefBy, foreignKeys: foreignFKeys, columns: foreignColumns } = tables[refTableName];

    if (foreignRefBy && foreignRefBy[tableName]) {

      if (!alreadyAddedType.includes(refTableName)) {

        alreadyAddedType.push(refTableName);
        const refTableType = pascalCase(singular(refTableName));
        relationships += `\n    ${toCamelCase(singular(refTableName))}: ${refTableType}`;
      }
    }


    else if (Object.keys(foreignColumns).length !== Object.keys(foreignFKeys).length + 1) {
      if (!alreadyAddedType.includes(refTableName)) {
        alreadyAddedType.push(refTableName);
        const refTableType = pascalCase(singular(refTableName));

        relationships += `\n    ${toCamelCase(refTableName)}: [${refTableType}]`;
      }
    }

    for (const foreignFKey in foreignFKeys) {

      if (tableName !== foreignFKeys[foreignFKey].referenceTable) {
        if (!alreadyAddedType.includes(refTableName)) {
          alreadyAddedType.push(refTableName);
          const manyToManyTable = toCamelCase(foreignFKeys[foreignFKey].referenceTable);
          relationships += `\n    ${manyToManyTable}: [${pascalCase(singular(manyToManyTable))}]`;
        }
      }
    }
  }


  // ---------------- CHECK LOGIC--------------------------- //
  for (const FKTableName in tables[tableName].foreignKeys) {
    const object = tables[tableName].foreignKeys[FKTableName];
    const refTableName = object.referenceTable;
    if (refTableName) {
      const refTableType = pascalCase(singular(refTableName));
      relationships += `\n    ${toCamelCase(refTableName)}: [${refTableType}]`;
    }
  }

  return relationships;
};

module.exports = {
  customHelper,
  typeSet,
  mutationHelper,
  isJoinTable,
};
