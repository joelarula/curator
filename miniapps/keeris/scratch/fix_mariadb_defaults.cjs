const mysql = require('mysql2/promise');

async function fix() {
  const conn = await mysql.createConnection('mysql://curator:curator_secret@192.168.1.110:3306/curator');
  
  const tables = ['RoleInheritance', 'RolePermission', 'UserRole', 'AgentRole'];
  for (const t of tables) {
    try {
      const [cols] = await conn.query(`DESCRIBE ${t}`);
      for (const col of cols) {
        if (col.Field === 'createdAt' || col.Field === 'updatedAt') {
          console.log(`Setting default for ${t}.${col.Field}`);
          await conn.query(`ALTER TABLE ${t} MODIFY ${col.Field} DATETIME DEFAULT CURRENT_TIMESTAMP`);
        }
      }
    } catch (e) {
      console.warn(e.message);
    }
  }

  // Also check if any other table has NOT NULL createdAt without default
  const [allTables] = await conn.query('SHOW TABLES');
  for (const row of allTables) {
    const tableName = Object.values(row)[0];
    try {
      const [cols] = await conn.query(`DESCRIBE ${tableName}`);
      for (const col of cols) {
        if (col.Field === 'createdAt' && col.Null === 'NO' && col.Default === null) {
          console.log(`Fixing missing default on ${tableName}.createdAt`);
          await conn.query(`ALTER TABLE ${tableName} MODIFY createdAt DATETIME DEFAULT CURRENT_TIMESTAMP`);
        }
        if (col.Field === 'updatedAt' && col.Null === 'NO' && col.Default === null) {
          console.log(`Fixing missing default on ${tableName}.updatedAt`);
          await conn.query(`ALTER TABLE ${tableName} MODIFY updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        }
      }
    } catch (_) {}
  }

  console.log('✓ All defaults updated!');
  await conn.end();
}

fix().catch(console.error);
