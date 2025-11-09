"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectFilesArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataOrderByWithRelationInput_1 = require("../../../inputs/FileDataOrderByWithRelationInput");
const FileDataWhereInput_1 = require("../../../inputs/FileDataWhereInput");
const FileDataWhereUniqueInput_1 = require("../../../inputs/FileDataWhereUniqueInput");
const FileDataScalarFieldEnum_1 = require("../../../../enums/FileDataScalarFieldEnum");
let ProjectFilesArgs = class ProjectFilesArgs {
};
exports.ProjectFilesArgs = ProjectFilesArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], ProjectFilesArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataOrderByWithRelationInput_1.FileDataOrderByWithRelationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectFilesArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], ProjectFilesArgs.prototype, "cursor", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ProjectFilesArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ProjectFilesArgs.prototype, "skip", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataScalarFieldEnum_1.FileDataScalarFieldEnum], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectFilesArgs.prototype, "distinct", void 0);
exports.ProjectFilesArgs = ProjectFilesArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], ProjectFilesArgs);
