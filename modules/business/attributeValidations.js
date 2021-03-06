'use strict';

let Router = require('../../helpers/router.js');
let OrderBy = require('../../helpers/orderBy.js');
let schema = require('../../schema/business/attributes.js');
let slots = require('../../helpers/slots.js');
let moment = require('moment');
let sql = require('../../sql/business/attributes.js');
let transactionTypes = require('../../helpers/transactionTypes.js');
let messages = require('../../helpers/messages.js');
let constants = require('../../helpers/constants.js');
let _ = require('lodash');
let attributes = require('./attributes.js');
let identityUses = require('./identityUses.js');

// Private fields
let modules, library, self, __private = {}, shared = {};

__private.assetTypes = {};

// Constructor
function AttributeValidations(cb, scope) {
    library = scope;
    self = this;

    let AttributeValidationRequest = require('../../logic/attributeValidationRequest.js');
    __private.assetTypes[transactionTypes.REQUEST_ATTRIBUTE_VALIDATION] = library.logic.transaction.attachAssetType(
        transactionTypes.REQUEST_ATTRIBUTE_VALIDATION, new AttributeValidationRequest()
    );

    let ApproveAttributeValidationRequest = require('../../logic/attributeValidationRequestApprove.js');
    __private.assetTypes[transactionTypes.APPROVE_ATTRIBUTE_VALIDATION_REQUEST] = library.logic.transaction.attachAssetType(
        transactionTypes.APPROVE_ATTRIBUTE_VALIDATION_REQUEST, new ApproveAttributeValidationRequest()
    );

    let DeclineAttributeValidationRequest = require('../../logic/attributeValidationRequestDecline.js');
    __private.assetTypes[transactionTypes.DECLINE_ATTRIBUTE_VALIDATION_REQUEST] = library.logic.transaction.attachAssetType(
        transactionTypes.DECLINE_ATTRIBUTE_VALIDATION_REQUEST, new DeclineAttributeValidationRequest()
    );

    let NotarizeAttributeValidationRequest = require('../../logic/attributeValidationRequestNotarize.js');
    __private.assetTypes[transactionTypes.NOTARIZE_ATTRIBUTE_VALIDATION_REQUEST] = library.logic.transaction.attachAssetType(
        transactionTypes.NOTARIZE_ATTRIBUTE_VALIDATION_REQUEST, new NotarizeAttributeValidationRequest()
    );

    let RejectAttributeValidationRequest = require('../../logic/attributeValidationRequestReject.js');
    __private.assetTypes[transactionTypes.REJECT_ATTRIBUTE_VALIDATION_REQUEST] = library.logic.transaction.attachAssetType(
        transactionTypes.REJECT_ATTRIBUTE_VALIDATION_REQUEST, new RejectAttributeValidationRequest()
    );

    let CancelAttributeValidationRequest = require('../../logic/attributeValidationRequestCancel.js');
    __private.assetTypes[transactionTypes.CANCEL_ATTRIBUTE_VALIDATION_REQUEST] = library.logic.transaction.attachAssetType(
        transactionTypes.CANCEL_ATTRIBUTE_VALIDATION_REQUEST, new CancelAttributeValidationRequest()
    );

    return cb(null, self);
}

//
//__EVENT__ `onAttachPublicApi`

//
AttributeValidations.prototype.onAttachPublicApi = function () {
    __private.attachApi();
};

// Events
//
//__EVENT__ `onBind`

//
AttributeValidations.prototype.onBind = function (scope) {
    modules = scope;

    __private.assetTypes[transactionTypes.REQUEST_ATTRIBUTE_VALIDATION].bind({
        modules: modules, library: library
    });

    __private.assetTypes[transactionTypes.APPROVE_ATTRIBUTE_VALIDATION_REQUEST].bind({
        modules: modules, library: library
    });

    __private.assetTypes[transactionTypes.DECLINE_ATTRIBUTE_VALIDATION_REQUEST].bind({
        modules: modules, library: library
    });

    __private.assetTypes[transactionTypes.NOTARIZE_ATTRIBUTE_VALIDATION_REQUEST].bind({
        modules: modules, library: library
    });

    __private.assetTypes[transactionTypes.REJECT_ATTRIBUTE_VALIDATION_REQUEST].bind({
        modules: modules, library: library
    });

    __private.assetTypes[transactionTypes.CANCEL_ATTRIBUTE_VALIDATION_REQUEST].bind({
        modules: modules, library: library
    });
};

// Private methods
__private.attachApi = function () {
    let router = new Router();

    router.use(function (req, res, next) {
        if (modules) {
            return next();
        }
        res.status(500).send({success: false, error: messages.BLOCKCHAIN_LOADING});
    });

    router.map(shared, {
        'post /validationrequest': 'requestAttributeValidation',
        'get /validationrequest': 'getAttributeValidationRequests',
        'get /validationscore': 'getAttributeValidationScore',
        'get /credibility': 'getAttributeValidationCredibility',
        'post /approve': 'approveValidationRequest',
        'post /decline': 'declineValidationRequest',
        'post /notarize': 'notarizeValidationRequest',
        'post /reject': 'rejectValidationRequest',
        'post /cancel': 'cancelValidationRequest',
    });

    router.use(function (req, res, next) {
        res.status(500).send({success: false, error: messages.API_ENDPOINT_NOT_FOUND});
    });

    library.network.app.use('/api/attribute-validations', router);
    library.network.app.use(function (err, req, res, next) {
        if (!err) {
            return next();
        }
        library.logger.error(' API error ' + req.url, err);
        res.status(500).send({success: false, error: 'API error: ' + err.message});
    });
};

__private.getAttributeValidationRequests = function (filter, cb) {

    if (!filter.validator && !filter.owner && !filter.attributeId) {
        return cb(messages.INCORRECT_VALIDATION_REQUEST_PARAMETERS);
    }
    let query, params;
    if (filter.attributeId && !filter.validator) {
        query = sql.AttributeValidationRequestsSql.getAttributeValidationRequestsForAttribute;
        params = {attributeId: filter.attributeId}
    } else {
        if (filter.attributeId && filter.validator) {
            query = sql.AttributeValidationRequestsSql.getAttributeValidationRequestsForAttributeAndValidator;
            params = {validator: filter.validator, attributeId: filter.attributeId}
        } else {
            if (!filter.validator && filter.owner) {
                query = sql.AttributeValidationRequestsSql.getAttributeValidationRequestsForOwner;
                params = {owner: filter.owner}
            }
            if (filter.validator && !filter.owner) {
                query = sql.AttributeValidationRequestsSql.getAttributeValidationRequestsForValidator;
                params = {validator: filter.validator}
            }
            if (filter.validator && filter.owner) {
                query = sql.AttributeValidationRequestsSql.getAttributeValidationRequestsForOwnerAndValidator;
                params = {owner: filter.owner, validator: filter.validator}
            }
        }
    }

    library.db.query(query, params).then(function (validationRequests) {

        if (validationRequests.length > 0) {
            if (filter.status) {
                validationRequests = validationRequests.filter(validationRequest => validationRequest.status === filter.status)
            }
            return cb(null, validationRequests);
        }

        return cb(null, null);
    }).catch(function (err) {
        library.logger.error("stack", err.stack);
        return cb(err.message);
    })
};

__private.getAttributeValidationScore = function (filter, cb) {

    let timespanTimestamp = slots.getTime(moment().subtract(constants.MONTHS_FOR_ACTIVE_VALIDATION, 'months'));

    library.db.query(sql.AttributeValidationRequestsSql.getAttributeValidationsForAttributeAndStatus,
        {attribute_id: filter.attribute_id, status : constants.validationRequestStatus.COMPLETED, timespan : timespanTimestamp}).then(function (rows) {

        let attributeValidationScore = {};
        attributeValidationScore.score = rows.length;
        return cb(null, attributeValidationScore);
    }).catch(function (err) {
        library.logger.error("stack", err.stack);
        return cb(err.message);
    })
};

__private.getAttributeValidationCredibility = function (filter, cb) {

    if (!filter.months || filter.months <= 0) {
        return cb(messages.INCORRECT_MONTHS_VALUE)
    }
    if (!filter.owner && !filter.attributeId ) {
        return cb(messages.INCORRECT_CREDIBILITY_PARAMETERS)
    }
    if (filter.owner && filter.attributeId) {
        return cb(messages.INCORRECT_CREDIBILITY_PARAMETERS)
    }

    let timespanTimestamp = slots.getTime(moment().subtract(filter.months, 'months'));
    let query, params;

    params = {status: constants.validationRequestStatus.COMPLETED, timespan: timespanTimestamp};
    if (filter.attributeId) {
        query = sql.AttributeValidationRequestsSql.getAttributeValidationsForAttributeAndStatus;
        params.attribute_id = filter.attributeId;
    } else if (filter.owner) {
        query = sql.AttributeValidationRequestsSql.getAttributeValidationsForOwnerAndStatus;
        params.owner = filter.owner;
    }
    library.db.query(query, params).then(function (rows) {
        let attributeValidationScore = {};
        if (filter.attributeId) {
            attributeValidationScore.trust_points = rows.length;
            attributeValidationScore.attributeId = filter.attributeId;
        } else {
            let attributeGroups = _.groupBy(rows, function(row) {
                return row.attribute_id;
            });
            let trustPoints = [];
            Object.keys(attributeGroups).forEach(function (group) {
                trustPoints.push({
                    attributeId : parseInt(group),
                    credibility : attributeGroups[group].length
                })
            })
            attributeValidationScore.trust_points = trustPoints;
        }
        return cb(null, attributeValidationScore);
    }).catch(function (err) {
        library.logger.error("stack", err.stack);
        return cb(err.message);
    })
};

__private.checkValidationAnswer = function(params, cb) {

    if (params.answer === constants.validationRequestActions.APPROVE) {
        if (params.status !== constants.validationRequestStatus.PENDING_APPROVAL) {
            return cb(messages.ATTRIBUTE_VALIDATION_REQUEST_NOT_PENDING_APPROVAL);
        }

        return cb(null, {transactionType : transactionTypes.APPROVE_ATTRIBUTE_VALIDATION_REQUEST});
    }
    if (params.answer === constants.validationRequestActions.DECLINE) {
        if (params.status !== constants.validationRequestStatus.PENDING_APPROVAL) {
            return cb(messages.ATTRIBUTE_VALIDATION_REQUEST_NOT_PENDING_APPROVAL);
        }

        return cb(null, {transactionType : transactionTypes.DECLINE_ATTRIBUTE_VALIDATION_REQUEST});
    }

    if (params.answer === constants.validationRequestActions.NOTARIZE) {
        if (params.status !== constants.validationRequestStatus.IN_PROGRESS) {
            return cb(messages.ATTRIBUTE_VALIDATION_REQUEST_NOT_IN_PROGRESS);
        }
        return cb(null, {transactionType : transactionTypes.NOTARIZE_ATTRIBUTE_VALIDATION_REQUEST});
    }

    if (params.answer === constants.validationRequestActions.REJECT) {
        if (params.status !== constants.validationRequestStatus.IN_PROGRESS) {
            return cb(messages.ATTRIBUTE_VALIDATION_REQUEST_NOT_IN_PROGRESS);
        }
        return cb(null, {transactionType : transactionTypes.REJECT_ATTRIBUTE_VALIDATION_REQUEST});
    }

    if (params.answer === constants.validationRequestActions.CANCEL) {
        if (params.status !== constants.validationRequestStatus.PENDING_APPROVAL) {
            return cb(messages.ATTRIBUTE_VALIDATION_REQUEST_NOT_PENDING_APPROVAL);
        }
        return cb(null, {transactionType : transactionTypes.CANCEL_ATTRIBUTE_VALIDATION_REQUEST});
    }


    return cb(null, null);
};

__private.checkValidationAnswerSender = function (params, cb) {

    // only validators can answer with a validationRequestValidatorAction
    if (params.answer in constants.validationRequestValidatorActions){
        if (!params.account || params.account.address !== params.validator) {
            return cb(messages.VALIDATION_REQUEST_ANSWER_SENDER_IS_NOT_VALIDATOR_ERROR)
        }
    }

    // only owners can answer with a validationRequestOwnerAction
    if (params.answer in constants.validationRequestOwnerActions){
        if (!params.account || params.account.address !== params.owner) {
            return cb(messages.VALIDATION_REQUEST_ANSWER_SENDER_IS_NOT_OWNER_ERROR)
        }
    }

    return cb(null, null);
};

__private.validationRequestAnswer = function (req, cb) {
    library.schema.validate(req.body, schema.attributeOperation, function (err) {
        if (err) {
            return cb(err[0].message);
        }

        if (!req.body.asset || !req.body.asset.validation) {
            return cb('Validation is not provided');
        }

        if (!library.logic.transaction.validateAddress(req.body.asset.validation[0].owner)) {
            return cb(messages.INVALID_OWNER_ADDRESS);
        }

        if (!library.logic.transaction.validateAddress(req.body.asset.validation[0].validator)) {
            return cb(messages.INVALID_VALIDATOR_ADDRESS);
        }

        let keypair;
        if (!req.body.signature) {
            keypair = library.crypto.makeKeypair(req.body.secret);
        }
        if (keypair && req.body.publicKey) {
            if (keypair.publicKey.toString('hex') !== req.body.publicKey) {
                return cb(messages.INVALID_PASSPHRASE);
            }
        }

        let reqGetAttributesByFilter = req;
        reqGetAttributesByFilter.body.owner = req.body.asset.validation[0].owner;
        reqGetAttributesByFilter.body.type = req.body.asset.validation[0].type;
        reqGetAttributesByFilter.body.id = req.body.asset.validation[0].attributeId;

        attributes.getAttributesByFilter(reqGetAttributesByFilter.body, function (err, data) {
            if (err || !data.attributes || data.attributes.length === 0) {
                return cb(messages.ATTRIBUTE_NOT_FOUND);
            }

            if (data.attributes[0].expire_timestamp && data.attributes[0].expire_timestamp < slots.getTime()) {
                return cb(messages.EXPIRED_ATTRIBUTE);
            }

            if (!req.body.asset.validation[0].attributeId && data.attributes.length > 1) {
                return cb(messages.MORE_THAN_ONE_ATTRIBUTE_EXISTS);
            }

            if (data.attributes[0].rejected) {
                return cb(messages.REJECTED_ATTRIBUTE);
            }

            let dangerOfRejection = data.attributes[0].dangerOfRejection;

            let reqGetAttributeType = req;
            reqGetAttributeType.body.name =
                req.body.asset.validation[0].type ? req.body.asset.validation[0].type : data.attributes[0].type;

            attributes.getAttributeType(reqGetAttributeType.body, function (err, dataAttributeType) {
                if (err || !dataAttributeType.attribute_type) {
                    return cb(messages.ATTRIBUTE_TYPE_NOT_FOUND);
                }

                req.body.attributeId = data.attributes[0].id;
                req.body.validator = req.body.asset.validation[0].validator;

                __private.getAttributeValidationRequests(req.body, function (err, attributeValidationRequests) {

                    if (err || !attributeValidationRequests || attributeValidationRequests.length === 0) {
                        return cb(messages.VALIDATION_REQUEST_MISSING_FOR_ACTION);
                    }

                    if (dangerOfRejection && req.body.asset.validation[0].answer === constants.validationRequestActions.REJECT) {
                        identityUses.getIdentityUseRequestsByFilter({owner : req.body.asset.validation[0].owner}, function (err, data) {
                            if (data.identityUseRequests && data.identityUseRequests.length > 0) {
                                let type = req.body.asset.validation[0].type;
                                let identityUsesIdsToReject = [];
                                data.identityUseRequests.forEach(function (request) {
                                    let requestAttributeTypes = JSON.parse(request.attribute_types)
                                    if (requestAttributeTypes && requestAttributeTypes.length > 0 &&
                                        requestAttributeTypes.filter(attributeType => attributeType === type).length > 0) {
                                            identityUsesIdsToReject.push(request.id)
                                    }
                                });
                                if (identityUsesIdsToReject.length > 0) {
                                    req.body.asset.identityUsesIdsToReject = identityUsesIdsToReject;
                                }
                            }
                        })
                    }

                    // Filter out canceled, completed, rejected and declined validation requests, no answer can be performed on these types of requests
                    let statusesToFilterOut = [];
                    statusesToFilterOut.push(constants.validationRequestStatus.REJECTED);
                    statusesToFilterOut.push(constants.validationRequestStatus.DECLINED);
                    statusesToFilterOut.push(constants.validationRequestStatus.COMPLETED);
                    statusesToFilterOut.push(constants.validationRequestStatus.CANCELED);
                    if (attributeValidationRequests && attributeValidationRequests.length > 0) {
                        attributeValidationRequests = attributeValidationRequests.filter(validationRequest => statusesToFilterOut.indexOf(validationRequest.status) === -1)
                    }
                    if (attributeValidationRequests && attributeValidationRequests.length === 0) {
                        return cb(messages.VALIDATION_REQUEST_MISSING_IN_STATUS_FOR_ACTION);
                    }

                    let paramsCheckAnswer = {};
                    paramsCheckAnswer.answer = req.body.asset.validation[0].answer;
                    paramsCheckAnswer.status = attributeValidationRequests[0].status;

                    __private.checkValidationAnswer(paramsCheckAnswer, function (err, response) {
                        if (err) {
                            return cb(err)
                        }

                        if (!response) {
                            return cb(messages.UNKNOWN_VALIDATION_REQUEST_ANSWER)
                        }
                        let transactionType = response.transactionType;
                        req.body.asset.attributeValidationRequestId = attributeValidationRequests[0].id; // this is required inside the logic

                        modules.accounts.setAccountAndGet({publicKey: req.body.publicKey}, function (err, account) {
                            __private.checkValidationAnswerSender(
                                {
                                    account: account,
                                    answer: paramsCheckAnswer.answer,
                                    owner: req.body.owner,
                                    validator: req.body.validator
                                },
                                function (err, response) {
                                    if (err) {
                                        return cb(err);
                                    }

                                    attributes.buildTransaction({
                                            req: req,
                                            keypair: keypair,
                                            transactionType: transactionType
                                        },
                                        function (err, resultData) {
                                            if (err) {
                                                return cb(err);
                                            }
                                            return cb(null, resultData);
                                        });
                                });
                        });
                    });
                });
            });
        });
    });
};

shared.requestAttributeValidation = function (req, cb) {
    library.schema.validate(req.body, schema.attributeOperation, function (err) {
        if (err) {
            return cb(err[0].message);
        }

        if (!req.body.asset || !req.body.asset.validation) {
            return cb('Validation is not provided');
        }

        if (!library.logic.transaction.validateAddress(req.body.asset.validation[0].owner)) {
            return cb(messages.INVALID_OWNER_ADDRESS);
        }

        if (!library.logic.transaction.validateAddress(req.body.asset.validation[0].validator)) {
            return cb(messages.INVALID_VALIDATOR_ADDRESS);
        }

        if (req.body.asset.validation[0].owner === req.body.asset.validation[0].validator) {
            return cb(messages.OWNER_IS_VALIDATOR_ERROR);
        }

        let keypair;
        if (!req.body.signature) {
            keypair = library.crypto.makeKeypair(req.body.secret);
        }
        if (keypair && req.body.publicKey) {
            if (keypair.publicKey.toString('hex') !== req.body.publicKey) {
                return cb(messages.INVALID_PASSPHRASE);
            }
        }

        let reqGetAttributesByFilter = req;
        reqGetAttributesByFilter.body.owner = req.body.asset.validation[0].owner;
        reqGetAttributesByFilter.body.type = req.body.asset.validation[0].type;
        reqGetAttributesByFilter.body.id = req.body.asset.validation[0].attributeId;

        attributes.getAttributesByFilter(reqGetAttributesByFilter.body, function (err, data) {
            if (err) {
                return cb(err);
            }

            if (!data.attributes || data.attributes.length === 0) {
                return cb(messages.ATTRIBUTE_NOT_FOUND);
            }

            if (!req.body.asset.validation[0].attributeId && data.attributes.length > 1) {
                return cb(messages.MORE_THAN_ONE_ATTRIBUTE_EXISTS);
            }

            if (data.attributes[0].expire_timestamp && data.attributes[0].expire_timestamp < slots.getTime()) {
                return cb(messages.EXPIRED_ATTRIBUTE);
            }

            if (data.attributes[0].rejected) {
                return cb(messages.REJECTED_ATTRIBUTE);
            }

            let reqGetAttributeType = req;
            reqGetAttributeType.body.name =
                req.body.asset.validation[0].type ? req.body.asset.validation[0].type : data.attributes[0].type;
            attributes.getAttributeType(reqGetAttributeType.body, function (err, dataAttributeType) {
                if (err || !dataAttributeType.attribute_type) {
                    return cb(messages.ATTRIBUTE_TYPE_NOT_FOUND);
                }

                let attributeTypeOptions = JSON.parse(dataAttributeType.attribute_type.options)
                if (attributeTypeOptions && attributeTypeOptions.documentRequired === true && !data.attributes[0].documented) {
                    return cb(messages.ATTRIBUTE_WITH_NO_ASSOCIATIONS_CANNOT_BE_VALIDATED);
                }

                req.body.asset.validation[0].attribute_id =
                    req.body.asset.validation[0].id ? req.body.asset.validation[0].id : data.attributes[0].id;

                req.body.validator = req.body.asset.validation[0].validator;
                req.body.attributeId = req.body.asset.validation[0].attribute_id;

                __private.getAttributeValidationRequests(req.body, function (err, validationRequests) {

                    if (err) {
                        return cb(err);
                    }

                    // Filter out canceled, rejected and declined validation requests, creating a new request should be allowed in these cases
                    let statusesToFilterOut = [];
                    statusesToFilterOut.push(constants.validationRequestStatus.REJECTED);
                    statusesToFilterOut.push(constants.validationRequestStatus.DECLINED);
                    statusesToFilterOut.push(constants.validationRequestStatus.CANCELED);
                    if (validationRequests && validationRequests.length > 0) {
                        validationRequests = validationRequests.filter(validationRequest => statusesToFilterOut.indexOf(validationRequest.status) === -1)
                    }
                    if (validationRequests && validationRequests.length > 0 && validationRequests[0].status === constants.validationRequestStatus.PENDING_APPROVAL) {
                        return cb(messages.PENDING_APPROVAL_VALIDATION_REQUEST_ALREADY_EXISTS);
                    }

                    if (validationRequests && validationRequests.length > 0 && validationRequests[0].status === constants.validationRequestStatus.IN_PROGRESS) {
                        return cb(messages.IN_PROGRESS_VALIDATION_REQUEST_ALREADY_EXISTS);
                    }

                    if (validationRequests && validationRequests.length > 0 && validationRequests[0].status === constants.validationRequestStatus.COMPLETED) {
                        return cb(messages.COMPLETED_VALIDATION_REQUEST_ALREADY_EXISTS);
                    }
                    attributes.buildTransaction({
                            req: req,
                            keypair: keypair,
                            transactionType: transactionTypes.REQUEST_ATTRIBUTE_VALIDATION
                        },
                        function (err, resultData) {
                            if (err) {
                                return cb(err);
                            }
                            return cb(null, resultData);
                        });
                });
            });
        });
    });
};

shared.getAttributeValidationRequests = function (req, cb) {
    library.schema.validate(req.body, schema.getAttributeValidationRequests, function (err) {
        if (err) {
            return cb(err[0].message);
        }

        if (!req.body.attributeId && !req.body.validator && !req.body.owner) {
            return cb(messages.INCORRECT_VALIDATION_REQUEST_PARAMETERS)
        }

        __private.getAttributeValidationRequests(req.body, function (err, res) {
            if (err) {
                return cb(messages.ATTRIBUTE_VALIDATION_REQUESTS_FAIL);
            }

            if (!res) {
                return cb(null, {attribute_validation_requests: [], count: 0});
            }

            let resultData = {attribute_validation_requests: res, count: res.length};

            return cb(null, resultData);
        });
    });
};

shared.getAttributeValidationScore = function (req, cb) {
    library.schema.validate(req.body, schema.getAttributeValidationScore, function (err) {
        if (err) {
            return cb(err[0].message);
        }

        attributes.getAttributesByFilter(req.body, function (err, result) {

            if (!result || result.attributes.length === 0) {
                return cb(messages.ATTRIBUTE_NOT_FOUND);
            }

            if (!req.body.attributeId && result.attributes.length > 1) {
                return cb(messages.MORE_THAN_ONE_ATTRIBUTE_EXISTS);
            }

            req.body.attribute_id = req.body.attributeId ? req.body.attributeId : result.attributes[0].id;

            __private.getAttributeValidationScore(req.body, function (err, res) {
                if (err) {
                    return cb(err)
                }
                if (!res) {
                    return cb(null, {attribute_validations: 0});
                }

                return cb(null, {attribute_validations: res.score});
            });
        });
    });
};

shared.getAttributeValidationCredibility = function (req, cb) {

    library.schema.validate(req.body, schema.getAttributeValidationCredibility, function (err) {
        if (err) {
            return cb(err[0].message);
        }
            __private.getAttributeValidationCredibility(req.body, function (err, res) {
                if (err) {
                    return cb(err)
                }
                if (!res) {
                    return cb(null, {trust_points: 0});
                }

                return cb(null, {trust_points: res.trust_points});
            });
        });
};

shared.approveValidationRequest = function (req, cb) {

    req.body.asset.validation[0].answer = constants.validationRequestActions.APPROVE;
    __private.validationRequestAnswer(req, function (err, res) {
        if (err) {
            return cb(err)
        }

        return cb(null, res);
    });
};

shared.declineValidationRequest = function (req, cb) {
    if (!req.body.asset.validation[0].reason) {
        return cb(messages.DECLINE_ATTRIBUTE_VALIDATION_REQUEST_NO_REASON)
    }

    if (req.body.asset.validation[0].reason.length > 1024) {
        return cb(messages.REASON_TOO_BIG_DECLINE)
    }

    req.body.asset.validation[0].answer = constants.validationRequestActions.DECLINE;

    __private.validationRequestAnswer(req, function (err, res) {
        if (err) {
            return cb(err)
        }
        return cb(null, res);
    });
};

shared.notarizeValidationRequest = function (req, cb) {

    if (!req.body.asset.validation[0].validationType) {
        return cb(messages.MISSING_VALIDATION_TYPE);
    }
    if (!(req.body.asset.validation[0].validationType in constants.validationType)) {
        return cb(messages.INCORRECT_VALIDATION_TYPE);
    }

    req.body.asset.validation[0].answer = constants.validationRequestActions.NOTARIZE;
    __private.validationRequestAnswer(req, function (err, res) {
        if (err) {
            return cb(err)
        }
        return cb(null, res);
    });
};

shared.rejectValidationRequest = function (req, cb) {

    if (!req.body.asset.validation[0].reason) {
        return cb(messages.REJECT_ATTRIBUTE_VALIDATION_REQUEST_NO_REASON)
    }

    if (req.body.asset.validation[0].reason.length > 1024) {
        return cb(messages.REASON_TOO_BIG_REJECT)
    }


    req.body.asset.validation[0].answer = constants.validationRequestActions.REJECT;
    __private.validationRequestAnswer(req, function (err, res) {
        if (err) {
            return cb(err)
        }
        return cb(null, res);
    });
};


shared.cancelValidationRequest = function (req, cb) {

    req.body.asset.validation[0].answer = constants.validationRequestActions.CANCEL;
    __private.validationRequestAnswer(req, function (err, res) {
        if (err) {
            return cb(err)
        }
        return cb(null, res);
    });
};

AttributeValidations.prototype.getAttributeValidationScore = function (filter, cb) {
    return __private.getAttributeValidationScore(filter, cb);
};

// Export
module.exports = AttributeValidations;
