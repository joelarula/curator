"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByFileDataArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataOrderByWithAggregationInput_1 = require("../../../inputs/FileDataOrderByWithAggregationInput");
const FileDataScalarWhereWithAggregatesInput_1 = require("../../../inputs/FileDataScalarWhereWithAggregatesInput");
const FileDataWhereInput_1 = require("../../../inputs/FileDataWhereInput");
const FileDataScalarFieldEnum_1 = require("../../../../enums/FileDataScalarFieldEnum");
let GroupByFileDataArgs = class GroupByFileDataArgs {
};
exports.GroupByFileDataArgs = GroupByFileDataArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], GroupByFileDataArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataOrderByWithAggregationInput_1.FileDataOrderByWithAggregationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByFileDataArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataScalarFieldEnum_1.FileDataScalarFieldEnum], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByFileDataArgs.prototype, "by", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataScalarWhereWithAggregatesInput_1.FileDataScalarWhereWithAggregatesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataScalarWhereWithAggregatesInput_1.FileDataScalarWhereWithAggregatesInput)
], GroupByFileDataArgs.prototype, "having", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByFileDataArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByFileDataArgs.prototype, "skip", void 0);
exports.GroupByFileDataArgs = GroupByFileDataArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], GroupByFileDataArgs);
