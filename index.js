"use strict";

/**
 * Library for building SQL queries for Oracle DB based on given parameters
 *
 * Copyright(c) 2015 Mariusz Lichota
 * MIT Licensed
 */

const _ = require('lodash');

/**
 * If there isn't own MyError then use standard Error handler
 */
if(typeof global.MyError === 'undefined') global.MyError = Error;

const lib = {

    /**
     * Prepare WHERE clouse for SQL
     *
     * @param {Array|Object} where [
     *                          ['field LIKE ?', '%ola%'], // operator AND is default
     *                          ['field2 IS NULL', null, 'OR'],
     *                          {
     *                              type: 'AND',
     *                              nested: [
     *                                          ['field3 = ?', 5],
     *                                          ['field5 BETWEEN ? AND ?, [3, 4], 'OR']
     *                                      ] // nested in "AND ()"
     *                          }
     *                      ]
     *                      where {field1: 123, field2: 'abc'}
     * @param {Array} [params] - bind parameters [optional]
     * @param {string} ctx - current context
     * @returns {Object} {sql: '', params: []}
     * @private
     */
    prepareWhere: function(where, params, ctx = 'main') {
        params = params || [];

        try {
            if(_.isObject(where) && !_.isArray(where) && !_.isFunction(where)) {
                const where2 = [];
                _.each(where, function(v, k) {
                    where2.push([k + ' = ?', v]);
                });
                where = where2;
            }

            if (!where || where.length === 0) {
                return {sql: '', params: params};
            }

            if (!_.isArray(where)) {
                //noinspection ExceptionCaughtLocallyJS
                throw new Error('Parameter "where" must be an array of conditions!');
            }

            let sql = '(';

            if (where.length === 2 && typeof where[0] === 'string') {
                sql += where[0].replace(/(\?|:\d+)/g, function () {
                    const idx = params.length + 1;
                    params.push(where[1]);
                    return ':' + idx;
                });
            } else {
                _.each(where, function (v, i) {
                    if (typeof v === 'string') {
                        sql += (i === 0 ? '' : ' AND ') + v;
                    } else if (_.isArray(v) && v.length > 0) {
                        const p = (typeof v[1] !== 'undefined' ? (_.isArray(v[1]) ? v[1] : [v[1]]) : null);
                        let ii = 0;
                        sql += (i === 0 ? '' : (v[2] ? ' ' + v[2] + ' ' : ' AND '));
                        sql += v[0].replace(/(\?|:\d+)/g, function () {
                            const idx = params.length + 1;
                            params.push(p[ii]);
                            ii++;
                            return ':' + idx;
                        });
                    } else if (typeof v === 'object') {
                        const out = lib.prepareWhere(v.nested, params, 'nested');
                        sql += (ctx === 'nested' ? '' : ' ' + (v.type ? v.type : 'AND') + ' ') + out.sql;
                    }
                });
            }

            sql += ')';

            return { sql, params };
        } catch (e) {
            throw new MyError(e, {where, params});
        }
    },

    /**
     *
     * @param {String} tbl
     * @param {Array} [fields]
     * @param {Array} [where] see: _prepareWhere
     * @param {String|Array} [order] ['field1', ['field2', 'DESC']]
     * @param {Number} [limit]
     * @param {Number} [page]
     * @param {Boolean} [totalCount]
     * @param {String} [dbVer]
     * @returns {{sql: string, params: Array}}
     * @private
     */
    prepareQuery: function(tbl, fields, where, order, limit, page, totalCount, dbVer = '11') {
        try {
            let sql, params = [],
                fld  = (!fields ? '*' : fields.join(', ')),
                fld2 = (!fields ? 'a.*' : fields.join(', ')),
                tc = (totalCount ? ', Count(1) OVER () AS cnt__' : ''),
                where2,
                orderBy = '',
                ord = [];

            let wh = lib.prepareWhere(where, params);

            where2 = (wh.sql ? 'WHERE ' + wh.sql : '');

            if(order) {
                if(_.isArray(order) && order.length > 0) {
                    _.each(order, function (val, i) {
                        val = order[i];
                        if (_.isArray(val) && val.length === 2) {
                            ord.push(val[0] + ' ' + val[1]);
                        } else if (typeof val === 'string') {
                            ord.push(val);
                        }
                    });
                } else if (typeof order === 'string') {
                    ord = [order];
                }
                orderBy = 'ORDER BY ' + ord.join(', ');
            }

            if(typeof limit === 'undefined') {
                // simple SQL
                sql = `SELECT ${fld2}${tc} FROM ${tbl} a ${where2} ${orderBy}`;
            } else {
                // prevent sql injection
                if(limit !== Number(limit)) {
                    //noinspection ExceptionCaughtLocallyJS
                    throw new MyError('Parameter limit is not integer type!', { limit: limit });
                }
                if(page) {
                    if(page !== Number(page)) {
                        //noinspection ExceptionCaughtLocallyJS
                        throw new MyError('Parameter page is not integer type!', { page: page });
                    }
                } else {
                    page = 1;
                }

                if (dbVer >= '12') {
                    let offset = (page - 1) * limit;

                    sql = `SELECT ${fld2}${tc} FROM ${tbl} a ${where2} ${orderBy} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
                } else {
                    // when missing order or missing ID in order array then add ROWID to order array (prevent floating records between pages)
                    // Attention! this might not work with some types of views (eg. Oracle dictionary views) at the moment I have no idea how to do this better
                    if(!order) {
                        ord = ['rowid'];
                    } else {
                        const test = ord.join(' ') + ' ';
                        if(!test.match(/\s+id\s+/i)) {
                            ord.push('rowid');
                        }
                    }

                    if(!fields) {
                        fld = 't.*';
                    } else {
                        let fldArr = [];
                        fields.forEach(function(itm) {
                            fldArr.push('t.' + itm);
                        });
                        fld = fldArr.join(', ');
                    }

                    const sqlArr = [
                        'SELECT ' + fld + ', i.rn__' + (totalCount ? ', i.cnt__' : ''),
                        'FROM   (',
                        '          SELECT i.*',
                        '          FROM   (',
                        '                    SELECT i.*, ROWNUM AS rn__',
                        '                    FROM   (',
                        '                              SELECT ROWID              AS rid__',
                        (totalCount ? '                                     , Count(1) OVER () AS cnt__' : ''),
                        '                              FROM   ' + tbl + ' a',
                        '                              ' + (wh.sql ? 'WHERE  ' + wh.sql : ''),
                        '                              ORDER  BY ' + ord.join(', '),
                        '                           ) i',
                        '                    WHERE  ROWNUM <= :P_LAST_ROW',
                        '                 ) i',
                        '          WHERE  rn__ >= :P_FIRST_ROW',
                        '       ) i,',
                        '       ' + tbl + ' t',
                        'WHERE  i.rid__ = t.ROWID',
                        'ORDER  BY rn__'
                    ];

                    params.push(page * limit);
                    params.push((page - 1) * limit + 1);

                    sql = sqlArr.join('\n');
                }
            }

            return { sql: sql.trim(), params };
        } catch (e) {
            throw new MyError(e, { tbl, fields, where, order });
        }
    },

    /**
     * @param tbl
     * @param {Object} data // {field1: "value1", field2: "value2"}
     * @param {Array} where see: _prepareWhere
     * @returns {{sql: string, params: Array}}
     * @private
     */
    prepareUpdate: function(tbl, data, where) {
        try {
            if(typeof data !== 'object') {
                //noinspection ExceptionCaughtLocallyJS
                throw new Error('Second parameter must be an object eg. {field1: "value1", field2: "value2"}!');
            }

            const params = [], upd = [];
            let sql, i = 1;

            _.each(data, function (val, key) {
                if(val !== null & typeof val === 'object' && typeof val.name !== 'undefined') {
                    upd.push(key + ' = ' + val.name);
                } else {
                    upd.push(key + ' = :' + i);
                    params.push(val);
                    i++;
                }
            });

            if(upd.length === 0) {
                //noinspection ExceptionCaughtLocallyJS
                throw new MyError('Missing fields for update!', {tbl:tbl, data:data, where:where});
            }

            sql = 'UPDATE ' + tbl + ' a SET ' + upd.join(', ');

            const wh = lib.prepareWhere(where, params);
            sql += (wh.sql ? ' WHERE ' + wh.sql : '');

            return { sql: sql.trim(), params };
        } catch (e) {
            throw new MyError(e, {tbl: tbl, data: data, where: where});
        }
    },

    /**
     *
     * @param {String} tbl
     * @param {Object} data // {field1: "value1", field2: "value2"}
     * @returns {{sql: string, params: Array}}
     * @private
     */
    prepareInsert: function(tbl, data) {
        const
            fields = [],
            values = [],
            params = [];

        let sql,
            cnt = 1;

        try {
            if (typeof data !== 'object') {
                //noinspection ExceptionCaughtLocallyJS
                throw new MyError('Second parameter must be an object eg. {field1: "value1", field2: "value2"}!', {
                    data: data
                });
            }

            _.each(data, function (val, key) {
                fields.push(key);
                val = data[key];

                if(_.get(val, 'type') === 'sequence') {
                    values.push(val.name + '.NEXTVAL');
                } else if (_.get(val, 'type') === 'function') {
                    values.push(val.name + '()');
                } else if (_.get(val, 'name')) {
                    values.push(val.name);
                } else {
                    values.push(':' + cnt);
                    params.push(val);
                    cnt++;
                }
            });

            sql = "INSERT INTO " + tbl + " (" + fields.join(', ') + ") VALUES (" + values.join(', ') + ")";

            return { sql: sql.trim(), params };

        } catch (e) {
            throw new MyError(e, {tbl: tbl, data: data});
        }
    },

    /**
     * Prepare SQL for delete data from table
     *
     * @param tbl
     * @param where
     * @returns {{sql: string, params: (*|Array)}}
     */
    prepareDelete: function(tbl, where) {
        try {
            const params = [];
            let sql, wh;

            sql = 'DELETE FROM ' + tbl + ' a';

            wh = lib.prepareWhere(where, params);
            sql += (wh.sql ? ' WHERE ' + wh.sql : '');

            return {sql: sql.trim(), params: wh.params};
        } catch (e) {
            throw new MyError(e, {tbl: tbl, where: where});
        }
    }

};

const pub = {
    prepareWhere:  lib.prepareWhere,
    prepareQuery:  lib.prepareQuery,
    prepareUpdate: lib.prepareUpdate,
    prepareInsert: lib.prepareInsert,
    prepareDelete: lib.prepareDelete
};

module.exports = pub;
