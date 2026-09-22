function convertSqlToMysql(sql) {
  // If sql contains ||, replace top-level || inside expressions or replace with CONCAT
  // Notice the pattern: expr || expr || expr
  // We can convert: (A || B || C) -> CONCAT(A, B, C)
  // Or even simpler: replace ` || ` with `, ` inside a CONCAT wrapper if preceded by something,
  // Or match `coalesce(...) || ...`
  // Let's test regex:
  return sql.replace(/(coalesce\([^)]+\)|[a-zA-Z0-9_.]+|'[^']*')(?:\s*\|\|\s*(?:coalesce\([^)]+\)|[a-zA-Z0-9_.]+|'[^']*'))+/gi, (match) => {
    const parts = match.split(/\s*\|\|\s*/);
    return `CONCAT(${parts.join(', ')})`;
  });
}

const test1 = "WHERE LOWER(coalesce(t.artist, '') || ' ' || coalesce(t.title, '') || ' ' || t.raw_text) LIKE LOWER(?)";
console.log('Test 1:', convertSqlToMysql(test1));

const test2 = "WHERE (LOWER(coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?))";
console.log('Test 2:', convertSqlToMysql(test2));

const test3 = "WHERE LOWER(coalesce(ut.artist, '') || ' ' || coalesce(ut.title, '')) LIKE LOWER(?)";
console.log('Test 3:', convertSqlToMysql(test3));

const test4 = "WHERE (LOWER(coalesce(e.title, '') || ' ' || coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?))";
console.log('Test 4:', convertSqlToMysql(test4));
