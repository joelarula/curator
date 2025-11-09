"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCountFilesArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataWhereInput_1 = require("../../inputs/FileDataWhereInput");
let ProjectCountFilesArgs = class ProjectCountFilesArgs {
};
exports.ProjectCountFilesArgs = ProjectCountFilesArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], ProjectCountFilesArgs.prototype, "where", void 0);
exports.ProjectCountFilesArgs = ProjectCountFilesArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], ProjectCountFilesArgs);
