// setup MyError
require("./lib/my-error");

var assert   = require('assert'),
    ps = require('../index');

describe('Test 01 biblioteki PrepareSQL', function() {

    describe('test for prepareWhere simple args', function() {
        var results = ps.prepareWhere(['field1 IS NOT NULL']);
        it('should match sql', function(done) {
            assert.equal(results.sql, '(field1 IS NOT NULL)');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, []);
            done();
        });
    });

    describe('test for prepareWhere complex args', function() {
        var where = [
            ['field1 LIKE ?', '%ola%'],
            ['field2 IS NULL', null, 'OR'],
            {
                type: 'AND',
                nested: [
                    ['field3 = ?', 0],
                    ['field5 BETWEEN ? AND ?', [3, 4], 'OR']
                ]
            }
        ];
        var results = ps.prepareWhere(where);

        it('should match sql', function(done) {
            assert.equal(results.sql, '(field1 LIKE :1 OR field2 IS NULL AND (field3 = :2 OR field5 BETWEEN :3 AND :4))');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [ '%ola%', 0, 3, 4 ]);
            done();
        });
    });

    describe('test for prepareUpdate', function() {
        var results = ps.prepareUpdate('test', {field1: 'wart1', field2: 2}, [['id = ?', 10]]);
        it('should match sql', function(done) {
            assert.equal(results.sql, 'UPDATE test SET field1 = :1, field2 = :2 WHERE (id = :3)');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [ 'wart1', 2, 10 ] );
            done();
        });
    });

    describe('test for prepareQuery simple', function() {
        var results = ps.prepareQuery('a.basic');
        it('should match sql', function(done) {
            assert.equal(results.sql, 'SELECT * FROM a.basic');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, []);
            done();
        });
    });

    describe('test for prepareQuery complex', function() {
        var results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], ['field3 >= ?', 100], ['field2', ['field3', 'DESC']]);
        it('should match sql', function(done) {
            assert.equal(results.sql, 'SELECT field1, field2 AS alias FROM test WHERE (field3 >= :1) ORDER BY field2, field3 DESC');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [ 100 ] );
            done();
        });
    });

    describe('test for prepareQuery complex 2nd version', function() {
        var results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], { field3: 100, field4: 'abc' }, ['field2', ['field3', 'DESC']]);
        it('should match sql', function(done) {
            assert.equal(results.sql, 'SELECT field1, field2 AS alias FROM test WHERE (field3 = :1 AND field4 = :2) ORDER BY field2, field3 DESC');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [ 100, 'abc' ] );
            done();
        });
    });

    describe('test for prepareQuery complex with limit for oracle < 12', function() {
        var results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], ['field3 >= ?', 100], ['field2', ['field3', 'DESC']], 10, 2);
        it('should match sql', function(done) {
            assert.equal(results.sql, 'SELECT t.field1, t.field2 AS alias, i.rn__\nFROM   (\n          SELECT i.*\n          FROM   (\n                    SELECT i.*, ROWNUM AS rn__\n                    FROM   (\n                              SELECT ROWID              AS rid__\n\n                              FROM   test\n                              WHERE  (field3 >= :1)\n                              ORDER  BY field2, field3 DESC, rowid\n                           ) i\n                    WHERE  ROWNUM <= :P_LAST_ROW\n                 ) i\n          WHERE  rn__ >= :P_FIRST_ROW\n       ) i,\n       test t\nWHERE  i.rid__ = t.ROWID\nORDER  BY rn__');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [100, 20, 11]);
            done();
        });
    });

    describe('test for prepareQuery complex with limit and totalCount', function() {
        var results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], ['field3 >= ?', 100], ['field2', ['field3', 'DESC']], 10, 2, true);
        it('should match sql', function(done) {
            assert.equal(results.sql, 'SELECT t.field1, t.field2 AS alias, i.rn__, i.cnt__\nFROM   (\n          SELECT i.*\n          FROM   (\n                    SELECT i.*, ROWNUM AS rn__\n                    FROM   (\n                              SELECT ROWID              AS rid__\n                                     , Count(1) OVER () AS cnt__\n                              FROM   test\n                              WHERE  (field3 >= :1)\n                              ORDER  BY field2, field3 DESC, rowid\n                           ) i\n                    WHERE  ROWNUM <= :P_LAST_ROW\n                 ) i\n          WHERE  rn__ >= :P_FIRST_ROW\n       ) i,\n       test t\nWHERE  i.rid__ = t.ROWID\nORDER  BY rn__');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [100, 20, 11]);
            done();
        });
    });

    describe('test for prepareQuery complex with limit and totalCount for oracle >= 12', function() {
        var results = ps.prepareQuery('test', ['field1', 'field2 AS alias'], ['field3 >= ?', 100], ['field2', ['field3', 'DESC']], 10, 2, true, '12');
        it('should match sql', function(done) {
            assert.equal(results.sql, 'SELECT field1, field2 AS alias, Count(1) OVER () AS cnt__ FROM test WHERE (field3 >= :1) ORDER BY field2, field3 DESC OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [100]);
            done();
        });
    });

    describe('test for prepareDelete', function() {
        var results = ps.prepareDelete('test', ['id = ?', 55]);
        it('should match sql', function(done) {
            assert.equal(results.sql, 'DELETE FROM test WHERE (id = :1)');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [ 55 ] );
            done();
        });
    });

    // todo: fix it - test has error becouse order of object keys is not guaranted in JS
    describe('test for prepareInsert 1', function() {
        var results = ps.prepareInsert('test', {id: null, field_1: 'f1'});
        it('should match sql', function(done) {
            assert.equal(results.sql, 'INSERT INTO test (id, field_1) VALUES (:1, :2)');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [null,"f1"]);
            done();
        });
    });

    // todo: fix it - test has error becouse order of object keys is not guaranted in JS
    describe('test for prepareInsert 2', function() {
        var results = ps.prepareInsert('test', {id: {type: 'pk'}, field_1: 'f1', field_2: 'f2'});
        it('should match sql', function(done) {
            assert.equal(results.sql, 'INSERT INTO test (id, field_1, field_2) VALUES (:1, :2, :3)');
            done();
        });
        it('should match params', function(done) {
            assert.deepEqual(results.params, [{type: 'pk'},"f1","f2"]);
            done();
        });
    });

});
