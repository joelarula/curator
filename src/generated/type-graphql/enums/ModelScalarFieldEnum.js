"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelScalarFieldEnum = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
var ModelScalarFieldEnum;
(function (ModelScalarFieldEnum) {
    ModelScalarFieldEnum["id"] = "id";
    ModelScalarFieldEnum["name"] = "name";
    ModelScalarFieldEnum["columnName"] = "columnName";
    ModelScalarFieldEnum["source"] = "source";
})(ModelScalarFieldEnum || (exports.ModelScalarFieldEnum = ModelScalarFieldEnum = {}));
TypeGraphQL.registerEnumType(ModelScalarFieldEnum, {
    name: "ModelScalarFieldEnum",
    description: undefined,
});
