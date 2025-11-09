"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpsertWithoutFilesInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateWithoutFilesInput_1 = require("../inputs/ProjectCreateWithoutFilesInput");
const ProjectUpdateWithoutFilesInput_1 = require("../inputs/ProjectUpdateWithoutFilesInput");
const ProjectWhereInput_1 = require("../inputs/ProjectWhereInput");
let ProjectUpsertWithoutFilesInput = class ProjectUpsertWithoutFilesInput {
};
exports.ProjectUpsertWithoutFilesInput = ProjectUpsertWithoutFilesInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateWithoutFilesInput_1.ProjectUpdateWithoutFilesInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectUpdateWithoutFilesInput_1.ProjectUpdateWithoutFilesInput)
], ProjectUpsertWithoutFilesInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateWithoutFilesInput_1.ProjectCreateWithoutFilesInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectCreateWithoutFilesInput_1.ProjectCreateWithoutFilesInput)
], ProjectUpsertWithoutFilesInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereInput_1.ProjectWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectWhereInput_1.ProjectWhereInput)
], ProjectUpsertWithoutFilesInput.prototype, "where", void 0);
exports.ProjectUpsertWithoutFilesInput = ProjectUpsertWithoutFilesInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpsertWithoutFilesInput", {})
], ProjectUpsertWithoutFilesInput);
