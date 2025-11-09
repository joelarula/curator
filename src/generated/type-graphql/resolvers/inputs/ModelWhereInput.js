"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkListRelationFilter_1 = require("../inputs/ChunkListRelationFilter");
const IntFilter_1 = require("../inputs/IntFilter");
const StringFilter_1 = require("../inputs/StringFilter");
const StringNullableFilter_1 = require("../inputs/StringNullableFilter");
let ModelWhereInput = class ModelWhereInput {
};
exports.ModelWhereInput = ModelWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ModelWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ModelWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ModelWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ModelWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ModelWhereInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ModelWhereInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringNullableFilter_1.StringNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringNullableFilter_1.StringNullableFilter)
], ModelWhereInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkListRelationFilter_1.ChunkListRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkListRelationFilter_1.ChunkListRelationFilter)
], ModelWhereInput.prototype, "chunks", void 0);
exports.ModelWhereInput = ModelWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelWhereInput", {})
], ModelWhereInput);
