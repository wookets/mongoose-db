
var mongoose = require('mongoose');

/*
 * Hack until mongoose 3.10 comes out. See this: https://github.com/LearnBoost/mongoose/issues/1431
 */
mongoose.Document.prototype.savePromise = function () {
  var that = this;
  return new mongoose.Promise(function(resolve, reject) {
    that.save(function (err, item, numberAffected) {
      if (err) {
        reject(err);
      }
      resolve(item, numberAffected);
    });
  });
};

mongoose.Document.prototype.removePromise = function () {
  var that = this;
  return new mongoose.Promise(function(resolve, reject) {
    that.remove(function (err, item) {
      if (err) {
        reject(err);
      }
      resolve(item);
    });
  });
};

var db = {

  model: mongoose.model,

  count: function(type, where) {
    var Type = connection.model(type);
    return Type.count(where).exec();
  },

  create: function(type, document) {
    var Type = connection.model(type);
    return Type.create(document).then(function(result) {
      return result.toObject({getters: true, virtuals: true});
    });
  },

  find: function(type, query) {
    if (!query.where) {
      query = {where: query};
    }
    var Type = connection.model(type);
    var mql = Type.find(query.where);
    if (query.select) {
      mql.select(query.select);
    }
    if (query.limit) {
      mql.limit(query.limit);
    }
    if (query.sort) {
      mql.sort(query.sort);
    }
    if (query.skip) {
      mql.skip(query.skip);
    }
    mql.lean();
    return mql.exec();
  },

  findById: function(type, _id) {
    return db.findOne(type, {_id: _id});
  },

  findByIds: function(type, _ids) {
    var query = {
      where: {
        _id: {$in: _ids}
      }
    };
    return db.find(type, query);
  },

  findOne: function(type, query) {
    if (!query.where) {
      query = {where: query};
    }
    var Type = connection.model(type);
    var mql = Type.findOne(query.where);
    if (query.select) {
      mql.select(query.select);
    }
    mql.lean();
    return mql.exec();
  },

  findOrCreate: function(type, where, values) {
    return db.findOne(type, where).then(function(doc) {
      if (doc) return doc; // if found, return
      values = _.assign(values, where);
      return db.create(type, values);
    })
  },

  remove: function(type, where) {
    if (where._id) where = {_id: where._id}; // if they pass in a doc, just take _id
    var Type = connection.model(type);
    return Type.findOne(where).exec().then(function(result) {
      if (!result) return new Error('Document not found.');
      return result.removePromise();
    });
  },

  restore: function(type, where) {
    if (where._id) where = {_id: where._id}; // if they pass in a doc, just take _id
    return db.unset(type, where, {trashedOn: null});
  },

  save: function(type, document) {
    if (document._id) {
      return db.update(type, {_id: document._id}, document);
    } else {
      return db.create(type, document);
    }
  },

  set: function(_type, where, fields) {
    var Type = connection.model(_type);
    return Type.update(where, {$set: fields}, {multi: true, safe: true, strict: false}).exec();
  },

  sum: function(type, field) {
    var where = {
      $group: {
        _id: null,
        total: {
          $sum: '$' + field
        }
      }
    };
    var Type = connection.model(type);
    return Type.aggregate(where).exec().then(function(result) {
      return result[0].total;
    });
  },

  trash: function(type, where) {
    if (where._id) where = {_id: where._id}; // if they pass in a doc, just take _id
    return db.set(type, where, {trashedOn: new Date});
  },

  update: function(type, where, values) {
    var Type = connection.model(type);
    return Type.findOne(where).exec().then(function(result) {
      if (!result) return new Error('Document not found.');

      updateProperties(result, values);

      return result.savePromise().then(function(savedDoc) {
        return savedDoc.toObject({getters: true, virtuals: true});
      });
    });
  },

  upsert: function(type, where, values) {
    values = _.assign(values, where);
    var Type = connection.model(type);
    return Type.findOne(where).exec().then(function(result) {
      if (result) { // update
        updateProperties(result, values);
        return result.savePromise().then(function(savedDoc) {
          return savedDoc.toObject({getters: true, virtuals: true});
        });
      } else { // create
        return db.create(type, values);
      }
    });
  },

  unset: function(_type, where, fields) {
    var Type = connection.model(_type);
    return Type.update(where, {$unset: fields}, {multi: true, safe: true, strict: false}).exec();
  }


};

function updateProperties(document, valuesToUpdate) {
  // dont allow a user / developer to try and change any of these properties
  valuesToUpdate = _.omit(valuesToUpdate, ['__v', '_id', 'updatedOn', 'createdOn', 'trashedOn']);
  // copy over properties
  _.assign(document, valuesToUpdate);
}

module.exports = db;