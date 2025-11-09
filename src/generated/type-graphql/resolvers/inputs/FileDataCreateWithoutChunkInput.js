"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCreateWithoutChunkInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const ProjectCreateNestedOneWithoutFilesInput_1 = require("../inputs/ProjectCreateNestedOneWithoutFilesInput");
let FileDataCreateWithoutChunkInput = class FileDataCreateWithoutChunkInput {
};
exports.FileDataCreateWithoutChunkInput = FileDataCreateWithoutChunkInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateWithoutChunkInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateWithoutChunkInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateWithoutChunkInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateWithoutChunkInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataCreateWithoutChunkInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], FileDataCreateWithoutChunkInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], FileDataCreateWithoutChunkInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], FileDataCreateWithoutChunkInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateNestedOneWithoutFilesInput_1.ProjectCreateNestedOneWithoutFilesInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectCreateNestedOneWithoutFilesInput_1.ProjectCreateNestedOneWithoutFilesInput)
], FileDataCreateWithoutChunkInput.prototype, "project", void 0);
exports.FileDataCreateWithoutChunkInput = FileDataCreateWithoutChunkInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataCreateWithoutChunkInput", {})
], FileDataCreateWithoutChunkInput);
