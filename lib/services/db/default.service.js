const util = require('../util.service');
const modelsService = require('../models.service');

const service = {};

service.getAll = (model, modelDefinition, id, obj, user) => {
    const findStr = !user || user.isAdmin ? {} : { owner: user.id };
    return model.find(findStr).populate(buildPopulateStr(modelDefinition, 'getAll')).select('-owner');
}

service.search = (model, modelDefinition, id, obj, user) => {
    if (obj.page) {
        return service.searchWithPagination(model, modelDefinition, id, obj, user);
    }
    return model.find(buildFindStr(modelDefinition, obj.filter, user))
        .sort(obj.sort)
        .limit(obj.limit)
        .select(obj.select === {} ? { owner: false } : obj.select)
        .populate(obj.populate);
}

service.searchWithPagination = (model, modelDefinition, id, obj, user) => {
    return model.paginate(
        buildFindStr(modelDefinition, obj.filter, user),
        {
            select: obj.select === {} ? { owner: false } : obj.select,
            sort: obj.sort,
            populate: obj.populate,
            limit: obj.limit,
            page: obj.page
        }
    );
}

service.get = (model, modelDefinition, id, obj, user) => {
    return model.findById(id).populate(buildPopulateStr(modelDefinition, 'get')).select('-owner');
}

service.add = async (model, modelDefinition, id, obj, user) => {
    const objSchema = {};
    for (const prop in obj) {
        if (!(modelDefinition.properties[prop]
            && modelDefinition.properties[prop].methodsNotAllowed
            && modelDefinition.properties[prop].methodsNotAllowed.add)) {
            objSchema[prop] = util.checkIfType(modelDefinition.properties[prop].type) ? obj[prop] : createCustomModelProperty(obj[prop], modelDefinition.properties[prop].type);
        }
    }
    checkIfGenerateProperty(objSchema, modelDefinition);
    objSchema.owner = user.id;
    if (modelDefinition.properties.lastModified) {
        objSchema.lastModified = Date.now();
    }
    const newObj = new model(objSchema);
    const doc = await newObj.save();
    await modelsService.updateRelationships(null, doc, modelDefinition.relationships);
    return doc;
}

service.update = async (model, modelDefinition, id, obj) => {
    const updObj = {};
    for (const prop in obj) {
        if (!(modelDefinition.properties[prop]
            && modelDefinition.properties[prop].methodsNotAllowed
            && modelDefinition.properties[prop].methodsNotAllowed.update)) {
            updObj[prop] = obj[prop];
        }
    }
    if (modelDefinition.properties.lastModified) {
        updObj.lastModified = Date.now();
    }
    const doc = await model.findByIdAndUpdate(id, updObj);
    await modelsService.updateRelationships(obj, doc, modelDefinition.relationships);
    return doc;
}

service.remove = async (model, modelDefinition, id) => {
    const doc = await model.findById(id); 
    await doc.remove();
    doc.isRemoved = true;
    await modelsService.updateRelationships(null, doc, modelDefinition.relationships);
    return doc;
}

const buildFindStr = (modelDefinition, searchObj, user) => {
    const findStr = {};
    // Check if user is admin
    if (user && user.authLevel !== 'admin' && user.authLevel !== 'reader') {
        findStr.owner = user.id;
    }
    // Check properties
    for (const prop in searchObj) {
        if (searchObj[prop] !== null && searchObj[prop] !== '') {
            generateFindParam(findStr, prop, searchObj[prop], modelDefinition);
        }
    }
    return findStr;
}

const generateFindParam = (findStr, name, value, modelDefinition) => {
    const propertyName = (name.slice(-3) === 'Min' || name.slice(-3) === 'Max') ? name.substring(0, name.length - 3) : name;
    const type = modelDefinition.properties[propertyName].type;
    findStr[propertyName] = !findStr[propertyName] ? {} : findStr[propertyName];

    // if (!findStr[propertyName] && util.checkIfType(type)) {
    //     findStr[propertyName] = {};
    // }
    // if (!util.checkIfType(type)) {
    //     findStr[propertyName] = value;
    // }
    if (type.toLowerCase() === 'string') {
        findStr[propertyName] = { $regex: ".*" + value + ".*", $options : 'i' };
    }
    if (type.toLowerCase() === 'boolean') {
        findStr[propertyName] = value;
    }
    if (type.toLowerCase() === 'number' || type.toLowerCase() === 'date') {
        const greaterOrLower = name.slice(-3) === 'Min' ? '$gt' : '$lt';
        findStr[propertyName][greaterOrLower] = value;
    }
}

const buildPopulateStr = (modelDefinition, method) => {
    let populateStr = '';
    for (const prop in modelDefinition.properties) {
        if (modelDefinition.properties[prop].populate && modelDefinition.properties[prop].populate[method]) {
            populateStr += prop + ' ';
        }
    }
    return populateStr;
}

const createCustomModelProperty = (objProp, type) => {
    if (typeof objProp === 'string') {
        return objProp;
    }
    if (type[0] === '[') {
        return [];
    }
    return null;
}

const createSearchObj = () => {
    return {};
}

const checkIfGenerateProperty = (objSchema, modelDefinition) => {
    for (const prop in modelDefinition.properties) {
        if (modelDefinition.properties[prop].generate === 'GUID') {
            objSchema[prop] = util.guid();
        }
    }
}

module.exports = service;