"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByTenantArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantOrderByWithAggregationInput_1 = require("../../../inputs/TenantOrderByWithAggregationInput");
const TenantScalarWhereWithAggregatesInput_1 = require("../../../inputs/TenantScalarWhereWithAggregatesInput");
const TenantWhereInput_1 = require("../../../inputs/TenantWhereInput");
const TenantScalarFieldEnum_1 = require("../../../../enums/TenantScalarFieldEnum");
let GroupByTenantArgs = class GroupByTenantArgs {
};
exports.GroupByTenantArgs = GroupByTenantArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereInput_1.TenantWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereInput_1.TenantWhereInput)
], GroupByTenantArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantOrderByWithAggregationInput_1.TenantOrderByWithAggregationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByTenantArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantScalarFieldEnum_1.TenantScalarFieldEnum], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByTenantArgs.prototype, "by", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantScalarWhereWithAggregatesInput_1.TenantScalarWhereWithAggregatesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantScalarWhereWithAggregatesInput_1.TenantScalarWhereWithAggregatesInput)
], GroupByTenantArgs.prototype, "having", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByTenantArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByTenantArgs.prototype, "skip", void 0);
exports.GroupByTenantArgs = GroupByTenantArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], GroupByTenantArgs);
