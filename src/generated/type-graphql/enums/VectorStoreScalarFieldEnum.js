"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreScalarFieldEnum = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
var VectorStoreScalarFieldEnum;
(function (VectorStoreScalarFieldEnum) {
    VectorStoreScalarFieldEnum["id"] = "id";
    VectorStoreScalarFieldEnum["namespace"] = "namespace";
    VectorStoreScalarFieldEnum["content"] = "content";
    VectorStoreScalarFieldEnum["metadata"] = "metadata";
    VectorStoreScalarFieldEnum["createdAt"] = "createdAt";
})(VectorStoreScalarFieldEnum || (exports.VectorStoreScalarFieldEnum = VectorStoreScalarFieldEnum = {}));
TypeGraphQL.registerEnumType(VectorStoreScalarFieldEnum, {
    name: "VectorStoreScalarFieldEnum",
    description: undefined,
});
