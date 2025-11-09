"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantScalarFieldEnum = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
var TenantScalarFieldEnum;
(function (TenantScalarFieldEnum) {
    TenantScalarFieldEnum["id"] = "id";
    TenantScalarFieldEnum["name"] = "name";
    TenantScalarFieldEnum["createdAt"] = "createdAt";
    TenantScalarFieldEnum["updatedAt"] = "updatedAt";
})(TenantScalarFieldEnum || (exports.TenantScalarFieldEnum = TenantScalarFieldEnum = {}));
TypeGraphQL.registerEnumType(TenantScalarFieldEnum, {
    name: "TenantScalarFieldEnum",
    description: undefined,
});
