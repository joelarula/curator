"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMinAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let TenantMinAggregate = class TenantMinAggregate {
};
exports.TenantMinAggregate = TenantMinAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], TenantMinAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMinAggregate.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], TenantMinAggregate.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], TenantMinAggregate.prototype, "updatedAt", void 0);
exports.TenantMinAggregate = TenantMinAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("TenantMinAggregate", {})
], TenantMinAggregate);
