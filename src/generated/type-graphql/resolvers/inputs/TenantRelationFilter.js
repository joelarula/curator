"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantRelationFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantWhereInput_1 = require("../inputs/TenantWhereInput");
let TenantRelationFilter = class TenantRelationFilter {
};
exports.TenantRelationFilter = TenantRelationFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereInput_1.TenantWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereInput_1.TenantWhereInput)
], TenantRelationFilter.prototype, "is", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereInput_1.TenantWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereInput_1.TenantWhereInput)
], TenantRelationFilter.prototype, "isNot", void 0);
exports.TenantRelationFilter = TenantRelationFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantRelationFilter", {})
], TenantRelationFilter);
