"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantUpdateOneRequiredWithoutProjectsNestedInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCreateOrConnectWithoutProjectsInput_1 = require("../inputs/TenantCreateOrConnectWithoutProjectsInput");
const TenantCreateWithoutProjectsInput_1 = require("../inputs/TenantCreateWithoutProjectsInput");
const TenantUpdateToOneWithWhereWithoutProjectsInput_1 = require("../inputs/TenantUpdateToOneWithWhereWithoutProjectsInput");
const TenantUpsertWithoutProjectsInput_1 = require("../inputs/TenantUpsertWithoutProjectsInput");
const TenantWhereUniqueInput_1 = require("../inputs/TenantWhereUniqueInput");
let TenantUpdateOneRequiredWithoutProjectsNestedInput = class TenantUpdateOneRequiredWithoutProjectsNestedInput {
};
exports.TenantUpdateOneRequiredWithoutProjectsNestedInput = TenantUpdateOneRequiredWithoutProjectsNestedInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateWithoutProjectsInput_1.TenantCreateWithoutProjectsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantCreateWithoutProjectsInput_1.TenantCreateWithoutProjectsInput)
], TenantUpdateOneRequiredWithoutProjectsNestedInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantCreateOrConnectWithoutProjectsInput_1.TenantCreateOrConnectWithoutProjectsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantCreateOrConnectWithoutProjectsInput_1.TenantCreateOrConnectWithoutProjectsInput)
], TenantUpdateOneRequiredWithoutProjectsNestedInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantUpsertWithoutProjectsInput_1.TenantUpsertWithoutProjectsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantUpsertWithoutProjectsInput_1.TenantUpsertWithoutProjectsInput)
], TenantUpdateOneRequiredWithoutProjectsNestedInput.prototype, "upsert", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantWhereUniqueInput_1.TenantWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantWhereUniqueInput_1.TenantWhereUniqueInput)
], TenantUpdateOneRequiredWithoutProjectsNestedInput.prototype, "connect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantUpdateToOneWithWhereWithoutProjectsInput_1.TenantUpdateToOneWithWhereWithoutProjectsInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantUpdateToOneWithWhereWithoutProjectsInput_1.TenantUpdateToOneWithWhereWithoutProjectsInput)
], TenantUpdateOneRequiredWithoutProjectsNestedInput.prototype, "update", void 0);
exports.TenantUpdateOneRequiredWithoutProjectsNestedInput = TenantUpdateOneRequiredWithoutProjectsNestedInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantUpdateOneRequiredWithoutProjectsNestedInput", {})
], TenantUpdateOneRequiredWithoutProjectsNestedInput);
