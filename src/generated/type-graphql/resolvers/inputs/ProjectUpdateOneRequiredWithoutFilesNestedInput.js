"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUpdateOneRequiredWithoutFilesNestedInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateOrConnectWithoutFilesInput_1 = require("../inputs/ProjectCreateOrConnectWithoutFilesInput");
const ProjectCreateWithoutFilesInput_1 = require("../inputs/ProjectCreateWithoutFilesInput");
const ProjectUpdateToOneWithWhereWithoutFilesInput_1 = require("../inputs/ProjectUpdateToOneWithWhereWithoutFilesInput");
const ProjectUpsertWithoutFilesInput_1 = require("../inputs/ProjectUpsertWithoutFilesInput");
const ProjectWhereUniqueInput_1 = require("../inputs/ProjectWhereUniqueInput");
let ProjectUpdateOneRequiredWithoutFilesNestedInput = class ProjectUpdateOneRequiredWithoutFilesNestedInput {
};
exports.ProjectUpdateOneRequiredWithoutFilesNestedInput = ProjectUpdateOneRequiredWithoutFilesNestedInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateWithoutFilesInput_1.ProjectCreateWithoutFilesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectCreateWithoutFilesInput_1.ProjectCreateWithoutFilesInput)
], ProjectUpdateOneRequiredWithoutFilesNestedInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateOrConnectWithoutFilesInput_1.ProjectCreateOrConnectWithoutFilesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectCreateOrConnectWithoutFilesInput_1.ProjectCreateOrConnectWithoutFilesInput)
], ProjectUpdateOneRequiredWithoutFilesNestedInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpsertWithoutFilesInput_1.ProjectUpsertWithoutFilesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectUpsertWithoutFilesInput_1.ProjectUpsertWithoutFilesInput)
], ProjectUpdateOneRequiredWithoutFilesNestedInput.prototype, "upsert", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereUniqueInput_1.ProjectWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectWhereUniqueInput_1.ProjectWhereUniqueInput)
], ProjectUpdateOneRequiredWithoutFilesNestedInput.prototype, "connect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectUpdateToOneWithWhereWithoutFilesInput_1.ProjectUpdateToOneWithWhereWithoutFilesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectUpdateToOneWithWhereWithoutFilesInput_1.ProjectUpdateToOneWithWhereWithoutFilesInput)
], ProjectUpdateOneRequiredWithoutFilesNestedInput.prototype, "update", void 0);
exports.ProjectUpdateOneRequiredWithoutFilesNestedInput = ProjectUpdateOneRequiredWithoutFilesNestedInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectUpdateOneRequiredWithoutFilesNestedInput", {})
], ProjectUpdateOneRequiredWithoutFilesNestedInput);
