const { singular } = require('pluralize');
const camelCase = require('camelcase');
const { pascalCase } = require('pascal-case');
const { isJoinTable } = require('./helperFunctions.js');
const resolverGenerator = {};

/* currentTable: {
  primaryKey: '___',
  foreignKeys: { foreignKeyName: { referenceTable: ____, referenceKey: ______ }, ....},
  referencedBy: {tableName: foreignKey, ...}, <--- this refers to tables that reference the current table
  columns: {
    columnName: {
      'dataType': _____,
      'columnDefault': _____,
      'charMaxLength': ______,
      'isNullable': ______,
    }
    .......
  },
}
*/

resolverGenerator.assembleQueries = (currentTable, tableData) => {
  const { primaryKey } = tableData;
  const queryByPrimaryKey = resolverGenerator.queryByPrimaryKey(
    currentTable,
    primaryKey
  );
  const queryAll = resolverGenerator.queryAll(currentTable);
  return `\n${queryByPrimaryKey}\n${queryAll}`;
};

resolverGenerator.assembleMutations = (currentTable, tableData) => {
  const { primaryKey, columns } = tableData;
  const createMutation = resolverGenerator.createMutation(
    currentTable,
    primaryKey,
    columns
  );
  const updateMutation = resolverGenerator.updateMutation(
    currentTable,
    primaryKey,
    columns
  );
  const deleteMutation = resolverGenerator.deleteMutation(
    currentTable,
    primaryKey
  );
  return `${createMutation}\n${updateMutation}\n${deleteMutation}\n`;
};

resolverGenerator.assembleCustomRelationships = (currentTable, tables) => {
  const { referencedBy } = tables[currentTable];
  if (!referencedBy) return '';
  const queryName = pascalCase(singular(currentTable));
  let relationshipTypes = '';

  relationshipTypes += resolverGenerator.determineRelationships(
    currentTable,
    tables
  );
  return `
    ${queryName}: {
      ${relationshipTypes}
    },\n`;
};

resolverGenerator.queryByPrimaryKey = (currentTable, primaryKey) => {
  let queryName = camelCase(singular(currentTable));
  if (currentTable === singular(currentTable)) queryName += 'ByID';
  return `
      ${queryName}: (parent, args) => {
        const query = 'SELECT * FROM ${currentTable} WHERE ${primaryKey} = $1';
        const values = [args.${primaryKey}];
        return db.query(query, values)
          .then(data => data.rows[0])
          .catch(err => new Error(err));
      },`;
};

resolverGenerator.queryAll = (currentTable) => {
  const queryName = camelCase(currentTable);
  return `
      ${queryName}: () => {
        const query = 'SELECT * FROM ${currentTable}';
        return db.query(query)
          .then(data => data.rows)
          .catch(err => new Error(err));
      },`;
};

resolverGenerator.createMutation = (currentTable, primaryKey, columns) => {
  const queryName = camelCase('create_' + singular(currentTable));
  const columnNames = Object.keys(columns);
  const queryValues = columnNames.filter((column) => column !== primaryKey);
  //const values = columnNames.map((el, i) => `$${++i}`); // * Revisit -- add join in line? line 95

  return `
      ${queryName}: (parent, args) => {
        const query = 'INSERT INTO ${currentTable}(${queryValues.join(
    ', '
  )}) VALUES(${queryValues.map((el, i) => `$${++i}`).join(', ')}) RETURNING *';
        const values = [${queryValues
          .map((column) => `args.${column}`)
          .join(', ')}];
        return db.query(query, values)
          .then(data => data.rows[0])
          .catch(err => new Error(err));
      },`;
};

resolverGenerator.updateMutation = (currentTable, primaryKey, columns) => {
  const queryName = camelCase('update_' + singular(currentTable));
  const columnNames = Object.keys(columns);
  const queryValues = columnNames.filter((column) => column !== primaryKey);
  const conditional = queryValues.length + 1;

  return `
      ${queryName}: (parent, args) => {
        const query = 'UPDATE ${currentTable} SET ${queryValues
    .map((el, i) => `${el}=$${++i}`)
    .join(', ')} WHERE ${primaryKey} = $${conditional} RETURNING *';
        const values = [${queryValues
          .map((column) => `args.${column}`)
          .join(', ')}, args.${primaryKey}];
        return db.query(query, values)
          .then(data => data.rows[0])
          .catch(err => new Error(err));
      },`;
};

resolverGenerator.deleteMutation = (currentTable, primaryKey) => {
  const queryName = camelCase('delete_' + singular(currentTable));

  return `
      ${queryName}: (parent, args) => {
        const query = 'DELETE FROM ${currentTable} WHERE ${primaryKey} = $1 RETURNING *';
        const values = [args.${primaryKey}];
        return db.query(query, values)
          .then(data => data.rows[0])
          .catch(err => new Error(err));
      },`;
};

resolverGenerator.determineRelationships = (currentTable, tables) => {
  const { primaryKey, referencedBy, foreignKeys } = tables[currentTable];
  let relationships = '';

  Object.keys(referencedBy).forEach((refTable) => {
    const {
      referencedBy: foreignRefBy,
      foreignKeys: foreignFKeys,
      columns: foreignColumns,
    } = tables[refTable];

    // One-to-One relationship
    if (foreignRefBy && foreignRefBy[currentTable]) {
      relationships += resolverGenerator.oneToOne(
        currentTable,
        primaryKey,
        refTable,
        referencedBy[refTable]
      );
    }
    // One-to-Many relationship
    else if (!isJoinTable(foreignFKeys, foreignColumns)) {
      relationships += resolverGenerator.oneToMany(
        currentTable,
        primaryKey,
        refTable,
        referencedBy[refTable]
      );
    }
    // Many-to-Many relationship
    else {
      // iterate through the foreign keys of the refTable -- refTable is a Join Table
      // locate the foreign key that does not reference our current table (this is the link to the 3rd table)
      Object.keys(foreignFKeys).forEach((FKey) => {
        if (currentTable !== foreignFKeys[FKey].referenceTable) {
          // store the name of the table that the join table links to our current table
          const manyToManyTable = foreignFKeys[FKey].referenceTable; // films
          // store the foreign key from the join table that links to the manyToManyTable
          const manyToManyTableRefKey = FKey; // films_id
          // store the foreign key from the join table that links the currentTable
          const currentTableRefKey =
            tables[currentTable].referencedBy[refTable]; // person_id
          // store the primary key name from the manyToManyTable
          const manyToManyTablePKey = tables[manyToManyTable].primaryKey; // primary key of the films table (_id)
          relationships += resolverGenerator.manyToMany(
            currentTable, // people
            primaryKey, // _id (primary key from people)
            refTable, // people_in_films ... aka join table
            manyToManyTableRefKey, // key inside of people_in_films that points to films table (film_id)
            currentTableRefKey, // key inside of people_in_films that points to people table (person_id)
            manyToManyTable, // films table
            manyToManyTablePKey // primary key from films table, aka _id
          );
        }
      });
      // confirm all relationships from foreign keys are captured
      if (foreignKeys) {
        Object.keys(foreignKeys).forEach((fk) => {
          const refTable = tables[currentTable].foreignKeys[fk].referenceTable;
          const refTablePk = tables[refTable].primaryKey;
          const refKey = tables[currentTable].foreignKeys[fk].referenceKey;
          const checkQuery = resolverGenerator.foreignKeyCheck(
            currentTable,
            primaryKey,
            refKey,
            fk,
            refTable,
            refTablePk
          );
          if (!relationships.includes(checkQuery)) relationships += checkQuery;
        });
      }
    }
  });
  return relationships;
};

resolverGenerator.oneToOne = (
  currentTable,
  primaryKey,
  refTable,
  refForeignKey
) => {
  return `
        ${camelCase(refTable)}: (${camelCase(currentTable)}) => {
          const query = 'SELECT * FROM ${refTable} WHERE ${refForeignKey} = $1';
          const values = [${currentTable}.${primaryKey}];
          return db.query(query, values)
            .then(data => data.rows[0])
            .catch(err => new Error(err));
        },`;
};

resolverGenerator.oneToMany = (
  currentTable,
  primaryKey,
  refTable,
  refForeignKey
) => {
  return `
        ${camelCase(refTable)}: (${camelCase(currentTable)}) => {
          const query = 'SELECT * FROM ${refTable} WHERE ${refForeignKey} $1';
          const values = [${currentTable}.${primaryKey}];
          return db.query(query, values)
            .then(data => data.rows)
            .catch(err => new Error(err));
        },`;
};

resolverGenerator.manyToMany = (
  currentTable,
  primaryKey,
  refTable,
  manyToManyTableRefKey,
  currentTableRefKey,
  manyToManyTable,
  manyToManyTablePKey
) => {
  return `
        ${camelCase(manyToManyTable)}: (${camelCase(currentTable)}) => {
          const query = 'SELECT * FROM ${manyToManyTable} LEFT OUTER JOIN ${refTable} ON ${manyToManyTable}.${manyToManyTablePKey} = ${refTable}.${manyToManyTableRefKey} WHERE ${refTable}.${currentTableRefKey} = $1';
          const values = [${currentTable}.${primaryKey}];
          return db.query(query, values)
            .then(data => data.rows)
            .catch(err => new Error(err));
        }, `;
};

resolverGenerator.foreignKeyCheck = (
  currentTable,
  primaryKey,
  refKey,
  fk,
  refTable,
  refTablePK
) => {
  return `
        ${camelCase(refTable)}: (${camelCase(currentTable)}) => {
          const query = 'SELECT ${refTable}.* FROM ${refTable} LEFT OUTER JOIN ${currentTable} ON ${refTable}.${refTablePK} = ${currentTable}.${refKey} WHERE ${currentTable}.${primaryKey} = $1';
          const values = [${currentTable}.${primaryKey}];
          return db.query(query, values)
            .then(data => data.rows)
            .catch(err => new Error(err));
        }, `;
};

module.exports = resolverGenerator;
