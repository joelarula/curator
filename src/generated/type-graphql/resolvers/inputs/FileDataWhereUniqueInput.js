"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataWhereUniqueInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const BytesNullableFilter_1 = require("../inputs/BytesNullableFilter");
const ChunkListRelationFilter_1 = require("../inputs/ChunkListRelationFilter");
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const FileDataNameProjectIdCompoundUniqueInput_1 = require("../inputs/FileDataNameProjectIdCompoundUniqueInput");
const FileDataWhereInput_1 = require("../inputs/FileDataWhereInput");
const IntFilter_1 = require("../inputs/IntFilter");
const ProjectRelationFilter_1 = require("../inputs/ProjectRelationFilter");
const StringFilter_1 = require("../inputs/StringFilter");
const StringNullableFilter_1 = require("../inputs/StringNullableFilter");
let FileDataWhereUniqueInput = class FileDataWhereUniqueInput {
};
exports.FileDataWhereUniqueInput = FileDataWhereUniqueInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataWhereUniqueInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataNameProjectIdCompoundUniqueInput_1.FileDataNameProjectIdCompoundUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataNameProjectIdCompoundUniqueInput_1.FileDataNameProjectIdCompoundUniqueInput)
], FileDataWhereUniqueInput.prototype, "name_projectId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereInput_1.FileDataWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataWhereUniqueInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereInput_1.FileDataWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataWhereUniqueInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereInput_1.FileDataWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataWhereUniqueInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataWhereUniqueInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataWhereUniqueInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringNullableFilter_1.StringNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringNullableFilter_1.StringNullableFilter)
], FileDataWhereUniqueInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataWhereUniqueInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], FileDataWhereUniqueInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => BytesNullableFilter_1.BytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", BytesNullableFilter_1.BytesNullableFilter)
], FileDataWhereUniqueInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], FileDataWhereUniqueInput.prototype, "projectId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], FileDataWhereUniqueInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], FileDataWhereUniqueInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectRelationFilter_1.ProjectRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectRelationFilter_1.ProjectRelationFilter)
], FileDataWhereUniqueInput.prototype, "project", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkListRelationFilter_1.ChunkListRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkListRelationFilter_1.ChunkListRelationFilter)
], FileDataWhereUniqueInput.prototype, "Chunk", void 0);
exports.FileDataWhereUniqueInput = FileDataWhereUniqueInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataWhereUniqueInput", {})
], FileDataWhereUniqueInput);
