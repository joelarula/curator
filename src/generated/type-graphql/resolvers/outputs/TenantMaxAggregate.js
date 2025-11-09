"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantMaxAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let TenantMaxAggregate = class TenantMaxAggregate {
};
exports.TenantMaxAggregate = TenantMaxAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], TenantMaxAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantMaxAggregate.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], TenantMaxAggregate.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], TenantMaxAggregate.prototype, "updatedAt", void 0);
exports.TenantMaxAggregate = TenantMaxAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("TenantMaxAggregate", {})
], TenantMaxAggregate);
