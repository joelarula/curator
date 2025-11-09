"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantSumAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let TenantSumAggregate = class TenantSumAggregate {
};
exports.TenantSumAggregate = TenantSumAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], TenantSumAggregate.prototype, "id", void 0);
exports.TenantSumAggregate = TenantSumAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("TenantSumAggregate", {})
], TenantSumAggregate);
