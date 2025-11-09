"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpdateToOneWithWhereWithoutFilesInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectUpdateWithoutFilesInput_1 = require("../inputs/ProjectUpdateWithoutFilesInput");
const ProjectWhereInput_1 = require("../inputs/ProjectWhereInput");
let ProjectUpdateToOneWithWhereWithoutFilesInput = class ProjectUpdateToOneWithWhereWithoutFilesInput {
};
exports.ProjectUpdateToOneWithWhereWithoutFilesInput = ProjectUpdateToOneWithWhereWithoutFilesInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereInput_1.ProjectWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectWhereInput_1.ProjectWhereInput)
], ProjectUpdateToOneWithWhereWithoutFilesInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateWithoutFilesInput_1.ProjectUpdateWithoutFilesInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectUpdateWithoutFilesInput_1.ProjectUpdateWithoutFilesInput)
], ProjectUpdateToOneWithWhereWithoutFilesInput.prototype, "data", void 0);
exports.ProjectUpdateToOneWithWhereWithoutFilesInput = ProjectUpdateToOneWithWhereWithoutFilesInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpdateToOneWithWhereWithoutFilesInput", {})
], ProjectUpdateToOneWithWhereWithoutFilesInput);
