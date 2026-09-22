const mysql = require('mysql2/promise');

async function test() {
  // Test option 1: sessionVariables in pool options
  const pool1 = mysql.createPool({
    uri: 'mysql://curator:curator_secret@192.168.1.110:3306/keeris',
    // In mysql2, sessionVariables can be passed:
    // wait, does mysql2 support it?
  });
  
  // Test option 2: query transform in prepare()
  // If sql has ||, e.g. a || ' ' || b, what if prepare transforms or what if we test sessionVariables?
}
