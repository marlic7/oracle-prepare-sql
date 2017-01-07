const
    assert = require('assert'),
    ps = require('../index');

describe('Test 01 biblioteki PrepareSQL', () => {

    describe('test for prepareWhere simple args', () => {
        const results = ps.prepareWhere(['field1 IS NOT NULL']);
        it('should match sql', () => {
            assert.equal(results.sql, '(field1 IS NOT NULL)');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, []);
        });
    });

    describe('test for prepareWhere complex args', () => {
        const where = [
            ['field1 LIKE ?', '%ola%'],
            ['field2 IS NULL', null, 'OR'],
            {
                //type: 'AND',
                nested: [
                    ['field3 = ?', 0],
                    ['field5 BETWEEN ? AND ?', [3, 4], 'OR']
                ]
            }
        ];
        const results = ps.prepareWhere(where);

        it('should match sql', () => {
            assert.equal(results.sql, '(field1 LIKE :1 OR field2 IS NULL AND (field3 = :2 OR field5 BETWEEN :3 AND :4))');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [ '%ola%', 0, 3, 4 ]);
        });
    });

    describe('test for prepareWhere with more complex args', () => {
        const where = [
            ["field_1 = ?", 2],
            {
                "type": "AND",
                "nested": [
                    {
                        "type": "AND",
                        "nested": [
                            ["field_2 = ?", 3],
                            ["field_3 IN (7,8,9)"]
                        ]
                    },
                    ["field_2 IN (2)", null, "OR"]
                ]
            }
        ];
        const results = ps.prepareWhere(where);

        it('should match sql', () => {
            assert.equal(results.sql, '(field_1 = :1 AND ((field_2 = :2 AND field_3 IN (7,8,9)) OR field_2 IN (2)))');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [ 2, 3 ]);
        });
    });

    describe('test for prepareUpdate', () => {
        const results = ps.prepareUpdate('test', {field1: 'wart1', field2: 2}, [['id = ?', 10]]);
        it('should match sql', () => {
            assert.equal(results.sql, 'UPDATE test SET field1 = :1, field2 = :2 WHERE (id = :3)');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [ 'wart1', 2, 10 ] );
        });
    });

    describe('test for prepareQuery simple', () => {
        const results = ps.prepareQuery('basic');
        it('should match sql', () => {
            assert.equal(results.sql.trim(), 'SELECT t.* FROM basic t');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, []);
        });
    });

    describe('test for prepareQuery with simple subquery', () => {
        const results = ps.prepareQuery('test', null, ['field_1 = ANY (SELECT field_x FROM test2 WHERE field_y = t.field_2)']);
        it('should match sql', () => {
            assert.equal(results.sql, 'SELECT t.* FROM test t WHERE (field_1 = ANY (SELECT field_x FROM test2 WHERE field_y = t.field_2))');
        });
    });

    describe('test for prepareQuery complex', () => {
        const results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], ['field3 >= ?', 100], ['field2', ['field3', 'DESC']]);
        it('should match sql', () => {
            assert.equal(results.sql, 'SELECT field1, field2 AS alias FROM test t WHERE (field3 >= :1) ORDER BY field2, field3 DESC');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [ 100 ] );
        });
    });

    describe('test for prepareQuery complex 2nd version', () => {
        const results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], { field3: 100, field4: 'abc' }, ['field2', ['field3', 'DESC']]);
        it('should match sql', () => {
            assert.equal(results.sql, 'SELECT field1, field2 AS alias FROM test t WHERE (field3 = :1 AND field4 = :2) ORDER BY field2, field3 DESC');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [ 100, 'abc' ] );
        });
    });

    describe('test for prepareQuery complex with limit for oracle < 12', () => {
        const results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], ['field3 >= ?', 100], ['field2', ['field3', 'DESC']], 10, 2);
        it('should match sql', () => {
            assert.equal(results.sql, 'SELECT t.field1, t.field2 AS alias, i.rn__\nFROM   (\n          SELECT i.*\n          FROM   (\n                    SELECT i.*, ROWNUM AS rn__\n                    FROM   (\n                              SELECT ROWID              AS rid__\n\n                              FROM   test\n                              WHERE  (field3 >= :1)\n                              ORDER  BY field2, field3 DESC, rowid\n                           ) i\n                    WHERE  ROWNUM <= :P_LAST_ROW\n                 ) i\n          WHERE  rn__ >= :P_FIRST_ROW\n       ) i,\n       test t\nWHERE  i.rid__ = t.ROWID\nORDER  BY rn__');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [100, 20, 11]);
        });
    });

    describe('test for prepareQuery complex with limit and totalCount', () => {
        const results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], ['field3 >= ?', 100], ['field2', ['field3', 'DESC']], 10, 2, true);
        it('should match sql', () => {
            assert.equal(results.sql, 'SELECT t.field1, t.field2 AS alias, i.rn__, i.cnt__\nFROM   (\n          SELECT i.*\n          FROM   (\n                    SELECT i.*, ROWNUM AS rn__\n                    FROM   (\n                              SELECT ROWID              AS rid__\n                                     , Count(1) OVER () AS cnt__\n                              FROM   test\n                              WHERE  (field3 >= :1)\n                              ORDER  BY field2, field3 DESC, rowid\n                           ) i\n                    WHERE  ROWNUM <= :P_LAST_ROW\n                 ) i\n          WHERE  rn__ >= :P_FIRST_ROW\n       ) i,\n       test t\nWHERE  i.rid__ = t.ROWID\nORDER  BY rn__');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [100, 20, 11]);
        });
    });

    describe('test for prepareQuery complex with limit and totalCount for oracle >= 12', () => {
        const results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], ['field3 >= ?', 100], ['field2', ['field3', 'DESC']], 10, 2, true, '12');
        it('should match sql', () => {
            assert.equal(results.sql, 'SELECT field1, field2 AS alias, Count(1) OVER () AS cnt__ FROM test t WHERE (field3 >= :1) ORDER BY field2, field3 DESC OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [100]);
        });
    });

    describe('test for prepareDelete', () => {
        const results = ps.prepareDelete('test', ['id = ?', 55]);
        it('should match sql', () => {
            assert.equal(results.sql, 'DELETE FROM test WHERE (id = :1)');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [ 55 ] );
        });
    });

    describe('test for prepareInsert 1', () => {
        const results = ps.prepareInsert('test', {id: null, field_1: 'f1'});
        it('should match sql', () => {
            assert.equal(results.sql, 'INSERT INTO test (id, field_1) VALUES (:1, :2)');
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [null,"f1"]);
        });
    });

    describe('test for prepareInsert 2', () => {
        const results = ps.prepareInsert('test', {id: {type: 'pk'}, field_1: 'f1', field_2: 'f2'});
        it('should match sql', () => {
            assert.equal(results.sql, 'INSERT INTO test (id, field_1, field_2) VALUES (:1, :2, :3)');
            
        });
        it('should match params', () => {
            assert.deepEqual(results.params, [{type: 'pk'},"f1","f2"]);
        });
    });

});
